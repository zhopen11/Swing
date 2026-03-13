"""The Swing — SQLite database setup and helpers."""

import sqlite3
from datetime import datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id       TEXT PRIMARY KEY,
    league        TEXT NOT NULL,
    game_date     TEXT NOT NULL,
    status        TEXT NOT NULL,
    away_abbr     TEXT NOT NULL,
    home_abbr     TEXT NOT NULL,
    away_id       TEXT,
    home_id       TEXT,
    away_name     TEXT,
    home_name     TEXT,
    away_color    TEXT,
    home_color    TEXT,
    away_score    INTEGER DEFAULT 0,
    home_score    INTEGER DEFAULT 0,
    period        INTEGER,
    clock         TEXT,
    network       TEXT,
    venue         TEXT,
    short_name    TEXT,
    name          TEXT,
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plays (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(game_id),
    play_index      INTEGER NOT NULL,
    period          INTEGER,
    clock           TEXT,
    wallclock       TEXT,
    team_id         TEXT,
    team_abbr       TEXT,
    play_text       TEXT,
    play_type       TEXT,
    score_value     INTEGER DEFAULT 0,
    shooting_play   INTEGER DEFAULT 0,
    home_score      INTEGER,
    away_score      INTEGER,
    possession_score REAL,
    UNIQUE(game_id, play_index)
);

CREATE TABLE IF NOT EXISTS momentum_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(game_id),
    snapshot_index  INTEGER NOT NULL,
    away_momentum   INTEGER NOT NULL,
    home_momentum   INTEGER NOT NULL,
    period          INTEGER,
    clock           TEXT,
    wallclock       TEXT,
    home_score      INTEGER,
    away_score      INTEGER,
    captured_at     TEXT,
    UNIQUE(game_id, snapshot_index)
);

CREATE TABLE IF NOT EXISTS game_momentum (
    game_id         TEXT PRIMARY KEY REFERENCES games(game_id),
    final_away_mom  INTEGER NOT NULL,
    final_home_mom  INTEGER NOT NULL,
    total_plays     INTEGER,
    total_teamed    INTEGER,
    computed_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(game_id),
    alert_type      TEXT NOT NULL,
    away_momentum   INTEGER NOT NULL,
    home_momentum   INTEGER NOT NULL,
    away_score      INTEGER NOT NULL,
    home_score      INTEGER NOT NULL,
    period          INTEGER,
    clock           TEXT,
    detected_at     TEXT NOT NULL,
    outcome_correct INTEGER
);

CREATE TABLE IF NOT EXISTS backfill_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id          TEXT NOT NULL REFERENCES games(game_id),
    total_alerts     INTEGER DEFAULT 0,
    bluffing_count   INTEGER DEFAULT 0,
    comeback_count   INTEGER DEFAULT 0,
    swing_warn_count INTEGER DEFAULT 0,
    bluff_correct    INTEGER DEFAULT 0,
    bluff_total      INTEGER DEFAULT 0,
    comeback_correct INTEGER DEFAULT 0,
    comeback_total   INTEGER DEFAULT 0,
    final_away_score INTEGER,
    final_home_score INTEGER,
    processed_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_game ON momentum_snapshots(game_id);
CREATE INDEX IF NOT EXISTS idx_alerts_game ON alerts(game_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_league ON games(league);
"""


def get_connection(path=None):
    """Create a connection with WAL mode for concurrent read/write."""
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(path=None):
    """Create all tables if they don't exist."""
    conn = get_connection(path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def upsert_game(conn, game):
    """Insert or update a game record."""
    conn.execute("""
        INSERT INTO games (
            game_id, league, game_date, status, away_abbr, home_abbr,
            away_id, home_id, away_name, home_name, away_color, home_color,
            away_score, home_score, period, clock, network, venue,
            short_name, name, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET
            status=excluded.status, away_score=excluded.away_score,
            home_score=excluded.home_score, period=excluded.period,
            clock=excluded.clock, updated_at=excluded.updated_at
    """, (
        game["id"], game["league"], game.get("game_date", ""),
        game["status"], game["away_abbr"], game["home_abbr"],
        game.get("away_id"), game.get("home_id"),
        game.get("away_name", ""), game.get("home_name", ""),
        game.get("away_color", ""), game.get("home_color", ""),
        game.get("away_score", 0), game.get("home_score", 0),
        game.get("period"), game.get("clock"),
        game.get("network", ""), game.get("venue", ""),
        game.get("short_name", ""), game.get("name", ""),
        now_iso(),
    ))


def store_plays(conn, game_id, scored_plays):
    """Bulk insert plays. Skips duplicates."""
    conn.executemany("""
        INSERT OR IGNORE INTO plays (
            game_id, play_index, period, clock, wallclock,
            team_id, team_abbr, play_text, play_type,
            score_value, shooting_play, home_score, away_score,
            possession_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, scored_plays)


def store_momentum_snapshots(conn, game_id, snapshots):
    """Replace all snapshots for a game."""
    conn.execute("DELETE FROM momentum_snapshots WHERE game_id = ?", (game_id,))
    conn.executemany("""
        INSERT INTO momentum_snapshots (
            game_id, snapshot_index, away_momentum, home_momentum,
            period, clock, wallclock, home_score, away_score, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, snapshots)


def store_game_momentum(conn, game_id, away_mom, home_mom, total_plays, total_teamed):
    """Upsert final momentum for a game."""
    conn.execute("""
        INSERT INTO game_momentum (game_id, final_away_mom, final_home_mom, total_plays, total_teamed, computed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET
            final_away_mom=excluded.final_away_mom, final_home_mom=excluded.final_home_mom,
            total_plays=excluded.total_plays, total_teamed=excluded.total_teamed,
            computed_at=excluded.computed_at
    """, (game_id, away_mom, home_mom, total_plays, total_teamed, now_iso()))


def store_alert(conn, game_id, alert_type, away_mom, home_mom, away_score, home_score, period, clock):
    """Insert an alert record."""
    conn.execute("""
        INSERT INTO alerts (game_id, alert_type, away_momentum, home_momentum,
                           away_score, home_score, period, clock, detected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (game_id, alert_type, away_mom, home_mom, away_score, home_score, period, clock, now_iso()))


def store_backfill_log(conn, log):
    """Insert a backfill log entry."""
    conn.execute("""
        INSERT INTO backfill_log (
            game_id, total_alerts, bluffing_count, comeback_count, swing_warn_count,
            bluff_correct, bluff_total, comeback_correct, comeback_total,
            final_away_score, final_home_score, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        log["game_id"], log["total_alerts"],
        log["bluffing_count"], log["comeback_count"], log["swing_warn_count"],
        log["bluff_correct"], log["bluff_total"],
        log["comeback_correct"], log["comeback_total"],
        log["final_away_score"], log["final_home_score"],
        now_iso(),
    ))


def has_game_momentum(conn, game_id):
    """Check if we already have final momentum for a game."""
    row = conn.execute(
        "SELECT 1 FROM game_momentum WHERE game_id = ?", (game_id,)
    ).fetchone()
    return row is not None


def get_game_status(conn, game_id):
    """Get the current status of a game."""
    row = conn.execute(
        "SELECT status FROM games WHERE game_id = ?", (game_id,)
    ).fetchone()
    return row["status"] if row else None
