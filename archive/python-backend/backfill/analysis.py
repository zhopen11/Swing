"""The Swing — Post-backfill analysis and reporting.

Usage:
    python -m backfill.analysis [--league NBA|CBB]
"""

import argparse
import logging

from backend import db

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def print_separator(title=""):
    if title:
        logger.info("\n%s %s %s", "─" * 20, title, "─" * 20)
    else:
        logger.info("─" * 60)


def run_analysis(league=None):
    """Query backfill results and print a summary report."""
    db.init_db()
    conn = db.get_connection()

    try:
        league_filter = ""
        params = []
        if league:
            league_filter = " AND g.league = ?"
            params = [league]

        # Overall stats
        print_separator("BACKFILL SUMMARY")

        row = conn.execute(f"""
            SELECT
                COUNT(DISTINCT bl.game_id) as games_with_alerts,
                SUM(bl.total_alerts) as total_alerts,
                SUM(bl.bluffing_count) as bluffing,
                SUM(bl.comeback_count) as comeback,
                SUM(bl.swing_warn_count) as swing_warning
            FROM backfill_log bl
            JOIN games g ON bl.game_id = g.game_id
            WHERE 1=1 {league_filter}
        """, params).fetchone()

        total_games = conn.execute(f"""
            SELECT COUNT(*) as cnt FROM games g
            JOIN game_momentum gm ON g.game_id = gm.game_id
            WHERE 1=1 {league_filter}
        """, params).fetchone()

        logger.info("Total games processed:     %d", total_games["cnt"])
        logger.info("Games with alerts:         %d", row["games_with_alerts"] or 0)
        logger.info("Total alerts fired:        %d", row["total_alerts"] or 0)
        logger.info("  BLUFFING:                %d", row["bluffing"] or 0)
        logger.info("  COMEBACK WATCH:          %d", row["comeback"] or 0)
        logger.info("  SWING WARNING:           %d", row["swing_warning"] or 0)

        # Alert accuracy
        print_separator("ALERT ACCURACY")

        acc = conn.execute(f"""
            SELECT
                SUM(bl.bluff_correct) as bc, SUM(bl.bluff_total) as bt,
                SUM(bl.comeback_correct) as cc, SUM(bl.comeback_total) as ct
            FROM backfill_log bl
            JOIN games g ON bl.game_id = g.game_id
            WHERE 1=1 {league_filter}
        """, params).fetchone()

        if acc["bt"] and acc["bt"] > 0:
            logger.info("BLUFFING accuracy:         %d/%d (%.1f%%)",
                        acc["bc"], acc["bt"], acc["bc"] / acc["bt"] * 100)
        else:
            logger.info("BLUFFING accuracy:         No data")

        if acc["ct"] and acc["ct"] > 0:
            logger.info("COMEBACK accuracy:         %d/%d (%.1f%%)",
                        acc["cc"], acc["ct"], acc["cc"] / acc["ct"] * 100)
        else:
            logger.info("COMEBACK accuracy:         No data")

        # Momentum distribution
        print_separator("MOMENTUM AT GAME END")

        dist = conn.execute(f"""
            SELECT
                AVG(gm.final_away_mom) as avg_away,
                AVG(gm.final_home_mom) as avg_home,
                MIN(gm.final_away_mom) as min_away,
                MAX(gm.final_away_mom) as max_away,
                MIN(gm.final_home_mom) as min_home,
                MAX(gm.final_home_mom) as max_home
            FROM game_momentum gm
            JOIN games g ON gm.game_id = g.game_id
            WHERE 1=1 {league_filter}
        """, params).fetchone()

        if dist["avg_away"] is not None:
            logger.info("Away momentum:  avg=%.1f  min=%d  max=%d",
                        dist["avg_away"], dist["min_away"], dist["max_away"])
            logger.info("Home momentum:  avg=%.1f  min=%d  max=%d",
                        dist["avg_home"], dist["min_home"], dist["max_home"])

        # Winner had higher momentum?
        print_separator("MOMENTUM vs OUTCOME")

        winner_mom = conn.execute(f"""
            SELECT
                COUNT(*) as total,
                SUM(CASE
                    WHEN (g.away_score > g.home_score AND gm.final_away_mom > gm.final_home_mom)
                      OR (g.home_score > g.away_score AND gm.final_home_mom > gm.final_away_mom)
                    THEN 1 ELSE 0 END) as winner_had_momentum,
                SUM(CASE
                    WHEN gm.final_away_mom = gm.final_home_mom THEN 1 ELSE 0
                END) as tied_momentum
            FROM game_momentum gm
            JOIN games g ON gm.game_id = g.game_id
            WHERE g.status = 'STATUS_FINAL' {league_filter}
        """, params).fetchone()

        if winner_mom["total"] > 0:
            pct = winner_mom["winner_had_momentum"] / winner_mom["total"] * 100
            logger.info("Winner had higher final momentum: %d/%d (%.1f%%)",
                        winner_mom["winner_had_momentum"], winner_mom["total"], pct)
            logger.info("Tied final momentum:              %d", winner_mom["tied_momentum"])

        # Most alert-heavy games
        print_separator("TOP 10 MOST VOLATILE GAMES")

        top = conn.execute(f"""
            SELECT bl.game_id, g.short_name, g.game_date, g.league,
                   g.away_score, g.home_score,
                   bl.total_alerts, bl.bluffing_count, bl.comeback_count, bl.swing_warn_count
            FROM backfill_log bl
            JOIN games g ON bl.game_id = g.game_id
            WHERE 1=1 {league_filter}
            ORDER BY bl.total_alerts DESC
            LIMIT 10
        """, params).fetchall()

        for r in top:
            logger.info("  %s  %s  %s  %d-%d  alerts=%d (B:%d C:%d S:%d)",
                        r["game_date"], r["league"], r["short_name"] or r["game_id"],
                        r["away_score"], r["home_score"],
                        r["total_alerts"], r["bluffing_count"],
                        r["comeback_count"], r["swing_warn_count"])

        # Biggest divergence games (high momentum gap + close/opposite score)
        print_separator("TOP 10 BIGGEST DIVERGENCES")

        div = conn.execute(f"""
            SELECT a.game_id, g.short_name, g.game_date, g.league,
                   a.away_momentum, a.home_momentum,
                   a.away_score, a.home_score,
                   ABS(a.away_momentum - a.home_momentum) as mom_gap,
                   a.alert_type
            FROM alerts a
            JOIN games g ON a.game_id = g.game_id
            WHERE a.alert_type = 'BLUFFING' {league_filter}
            ORDER BY mom_gap DESC
            LIMIT 10
        """, params).fetchall()

        for r in div:
            logger.info("  %s  %s  mom=%d-%d (gap=%d)  score=%d-%d  %s",
                        r["game_date"], r["short_name"] or r["game_id"],
                        r["away_momentum"], r["home_momentum"], r["mom_gap"],
                        r["away_score"], r["home_score"], r["league"])

        print_separator()

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="The Swing — Backfill Analysis")
    parser.add_argument("--league", choices=["NBA", "CBB"], help="Filter by league")
    args = parser.parse_args()
    run_analysis(args.league)


if __name__ == "__main__":
    main()
