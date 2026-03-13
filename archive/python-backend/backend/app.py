"""The Swing — Flask REST API."""

import logging
from datetime import datetime, timezone

from flask import Flask, jsonify, request

from . import db
from .poller import Poller
from .config import DB_PATH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = Flask(__name__)
poller = None


@app.before_request
def add_cors_headers():
    pass


@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


def _conn():
    return db.get_connection()


# ── GAME ENDPOINTS ───────────────────────────────────────────────────────────

@app.route("/api/games")
def list_games():
    """List games with optional filters: date, league, status."""
    conn = _conn()
    try:
        query = "SELECT g.*, gm.final_away_mom, gm.final_home_mom FROM games g LEFT JOIN game_momentum gm ON g.game_id = gm.game_id WHERE 1=1"
        params = []

        date = request.args.get("date")
        if date:
            query += " AND g.game_date = ?"
            params.append(date)

        league = request.args.get("league")
        if league:
            query += " AND g.league = ?"
            params.append(league.upper())

        status = request.args.get("status")
        if status:
            query += " AND g.status = ?"
            params.append(status)

        query += " ORDER BY g.game_date DESC, g.updated_at DESC"

        limit = request.args.get("limit", 100, type=int)
        query += " LIMIT ?"
        params.append(min(limit, 500))

        rows = conn.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/games/<game_id>")
def get_game(game_id):
    """Get a single game with momentum and recent plays."""
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT g.*, gm.final_away_mom, gm.final_home_mom, gm.total_plays, gm.total_teamed
            FROM games g
            LEFT JOIN game_momentum gm ON g.game_id = gm.game_id
            WHERE g.game_id = ?
        """, (game_id,)).fetchone()

        if not row:
            return jsonify({"error": "Game not found"}), 404

        game = dict(row)

        # Attach recent plays
        plays = conn.execute("""
            SELECT * FROM plays WHERE game_id = ?
            ORDER BY play_index DESC LIMIT 8
        """, (game_id,)).fetchall()
        game["recent_plays"] = [dict(p) for p in plays]

        return jsonify(game)
    finally:
        conn.close()


@app.route("/api/games/<game_id>/momentum")
def get_momentum_timeline(game_id):
    """Get full momentum timeline for a game (chart data)."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT * FROM momentum_snapshots
            WHERE game_id = ?
            ORDER BY snapshot_index
        """, (game_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/games/<game_id>/plays")
def get_plays(game_id):
    """Get full play-by-play with possession scores."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT * FROM plays WHERE game_id = ?
            ORDER BY play_index
        """, (game_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/games/<game_id>/alerts")
def get_game_alerts(game_id):
    """Get all alerts for a specific game."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT * FROM alerts WHERE game_id = ?
            ORDER BY detected_at
        """, (game_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ── LIVE ENDPOINT ────────────────────────────────────────────────────────────

@app.route("/api/live")
def live_games():
    """All currently live games with momentum. Replaces frontend ESPN calls."""
    conn = _conn()
    try:
        rows = conn.execute("""
            SELECT g.*, gm.final_away_mom, gm.final_home_mom
            FROM games g
            LEFT JOIN game_momentum gm ON g.game_id = gm.game_id
            WHERE g.status IN ('STATUS_IN_PROGRESS', 'STATUS_HALFTIME')
            ORDER BY g.league, g.away_abbr
        """).fetchall()

        games = []
        for row in rows:
            game = dict(row)
            # Attach momentum snapshots for chart
            snaps = conn.execute("""
                SELECT away_momentum, home_momentum, period, clock, wallclock,
                       home_score, away_score
                FROM momentum_snapshots
                WHERE game_id = ?
                ORDER BY snapshot_index
            """, (game["game_id"],)).fetchall()
            game["chart"] = [dict(s) for s in snaps]

            # Attach recent plays
            plays = conn.execute("""
                SELECT * FROM plays WHERE game_id = ?
                ORDER BY play_index DESC LIMIT 8
            """, (game["game_id"],)).fetchall()
            game["recent_plays"] = [dict(p) for p in plays]

            # Attach active alerts
            alert_rows = conn.execute("""
                SELECT alert_type FROM alerts
                WHERE game_id = ?
                ORDER BY detected_at DESC LIMIT 1
            """, (game["game_id"],)).fetchall()
            game["active_alerts"] = [dict(a) for a in alert_rows]

            games.append(game)

        return jsonify(games)
    finally:
        conn.close()


# ── ALERTS ENDPOINT ──────────────────────────────────────────────────────────

@app.route("/api/alerts")
def list_alerts():
    """Recent alerts across all games."""
    conn = _conn()
    try:
        query = """
            SELECT a.*, g.away_abbr, g.home_abbr, g.league, g.short_name
            FROM alerts a
            JOIN games g ON a.game_id = g.game_id
            WHERE 1=1
        """
        params = []

        alert_type = request.args.get("type")
        if alert_type:
            query += " AND a.alert_type = ?"
            params.append(alert_type.upper())

        date = request.args.get("date")
        if date:
            query += " AND g.game_date = ?"
            params.append(date)

        query += " ORDER BY a.detected_at DESC LIMIT 100"

        rows = conn.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ── STATS ENDPOINT ───────────────────────────────────────────────────────────

@app.route("/api/stats/alerts")
def alert_stats():
    """Aggregate alert accuracy from backfill data."""
    conn = _conn()
    try:
        row = conn.execute("""
            SELECT
                COUNT(*) as total_games,
                SUM(total_alerts) as total_alerts,
                SUM(bluffing_count) as bluffing_alerts,
                SUM(comeback_count) as comeback_alerts,
                SUM(swing_warn_count) as swing_warning_alerts,
                SUM(bluff_correct) as bluff_correct,
                SUM(bluff_total) as bluff_total,
                SUM(comeback_correct) as comeback_correct,
                SUM(comeback_total) as comeback_total
            FROM backfill_log
        """).fetchone()

        stats = dict(row)

        # Calculate accuracy percentages
        if stats["bluff_total"] and stats["bluff_total"] > 0:
            stats["bluff_accuracy"] = round(stats["bluff_correct"] / stats["bluff_total"] * 100, 1)
        else:
            stats["bluff_accuracy"] = None

        if stats["comeback_total"] and stats["comeback_total"] > 0:
            stats["comeback_accuracy"] = round(stats["comeback_correct"] / stats["comeback_total"] * 100, 1)
        else:
            stats["comeback_accuracy"] = None

        return jsonify(stats)
    finally:
        conn.close()


# ── STARTUP ──────────────────────────────────────────────────────────────────

def create_app():
    """Initialize DB, start poller, return app."""
    db.init_db()
    global poller
    poller = Poller()
    poller.start()
    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=False)
