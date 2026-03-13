"""The Swing — Momentum engine (Python port of JS algorithm).

This must produce identical output to the JavaScript version in index.html.
"""

import math

from .config import WINDOW, MAX_CHART_POINTS, WEIGHTS, RAW_MIN, RAW_MAX, NORM_MIN, NORM_MAX


def resolve_team(play_team, away_abbr, home_abbr, away_id=None, home_id=None):
    """Resolve which team a play belongs to.

    NBA plays use team.abbreviation, NCAA plays use team.id.
    Check ID first, then fall back to abbreviation.
    """
    if not play_team:
        return None

    tid = play_team.get("id")
    abbr = play_team.get("abbreviation")

    # ID match (NCAA primarily)
    if away_id and tid and str(tid) == str(away_id):
        return away_abbr
    if home_id and tid and str(tid) == str(home_id):
        return home_abbr

    # Abbreviation match (NBA primarily)
    if abbr == away_abbr:
        return away_abbr
    if abbr == home_abbr:
        return home_abbr

    return None


def score_possession(play):
    """Score a single play event. Returns the weighted momentum value.

    Uses the same keyword matching as the JS version.
    """
    text = (play.get("text") or "").lower()
    play_type = (play.get("type", {}).get("text") or "").lower() if isinstance(play.get("type"), dict) else ""
    val = play.get("scoreValue") or 0
    is_make = "makes" in text or "make" in text
    is_miss = "misses" in text or "miss" in text
    is_shooting = play.get("shootingPlay", False)

    score = 0.0

    # Shooting events
    if is_shooting:
        if val == 3:
            score = WEIGHTS["make3"] if is_make else WEIGHTS["miss3"]
        elif val == 2:
            score = WEIGHTS["make2"] if is_make else WEIGHTS["miss2"]
        elif val == 1:
            score = WEIGHTS["makeFT"] if is_make else WEIGHTS["missFT"]

    # Turnovers
    if "turnover" in play_type or "turnover" in text or "bad pass" in text or "lost ball" in text:
        score += WEIGHTS["turnover"]

    # Steals
    if "steal" in play_type or "steal" in text:
        score += WEIGHTS["steal"]

    # Blocks
    if "block" in play_type or "block" in text:
        score += WEIGHTS["block"]

    # Rebounds
    if "rebound" in play_type or "rebound" in text:
        if "offensive" in text:
            score += WEIGHTS["offReb"]
        else:
            score += WEIGHTS["defReb"]

    # Fast break
    if "fast break" in text or "fastbreak" in text:
        score += WEIGHTS["fastBreak"]

    return score


def to_momentum(raw):
    """Map raw window sum [-15, +15] to normalized [5, 95].

    Uses JS-compatible rounding (round half up) instead of Python's
    banker's rounding.
    """
    clamped = max(RAW_MIN, min(RAW_MAX, raw))
    value = NORM_MIN + ((clamped - RAW_MIN) / (RAW_MAX - RAW_MIN)) * (NORM_MAX - NORM_MIN)
    return int(math.floor(value + 0.5))


def compute_momentum_from_plays(plays, away_abbr, home_abbr, away_id=None, home_id=None):
    """Compute rolling momentum from a play-by-play array.

    Returns dict with:
        away: int (0-100)
        home: int (0-100)
        chart_away: list of snapshot dicts
        chart_home: list of snapshot dicts
        recent_plays: list of the last 8 teamed plays
        scored_plays: list of tuples for DB storage
        total_plays: total plays in input
        total_teamed: plays that resolved to a team
    Or None if no plays.
    """
    if not plays:
        return None

    # Filter plays attributable to a team
    teamed_plays = []
    for p in plays:
        team = resolve_team(p.get("team"), away_abbr, home_abbr, away_id, home_id)
        if team:
            teamed_plays.append((p, team))

    if not teamed_plays:
        return None

    chart_away = []
    chart_home = []
    away_window = []
    home_window = []
    scored_play_rows = []

    for i, (play, team) in enumerate(teamed_plays):
        ps = score_possession(play)

        # Same skip logic as JS: skip if score is 0 AND not a shooting play
        # AND type is not rebound/turnover/steal
        play_type_lower = (play.get("type", {}).get("text") or "").lower() if isinstance(play.get("type"), dict) else ""
        if (ps == 0
                and not play.get("shootingPlay", False)
                and "rebound" not in play_type_lower
                and "turnover" not in play_type_lower
                and "steal" not in play_type_lower):
            continue

        # Push to appropriate window
        if team == away_abbr:
            away_window.append(ps)
            if len(away_window) > WINDOW:
                away_window.pop(0)
        elif team == home_abbr:
            home_window.append(ps)
            if len(home_window) > WINDOW:
                home_window.pop(0)

        # Chart sampling every 5 plays (matching JS: i % 5 === 0 on teamed index)
        if i % 5 == 0:
            raw_away = sum(away_window)
            raw_home = sum(home_window)
            away_m = to_momentum(raw_away)
            home_m = to_momentum(raw_home)
            chart_away.append({
                "t": play.get("wallclock"),
                "p": play.get("period", {}).get("number") if isinstance(play.get("period"), dict) else None,
                "c": play.get("clock", {}).get("displayValue") if isinstance(play.get("clock"), dict) else None,
                "v": away_m,
                "hs": play.get("homeScore"),
                "as": play.get("awayScore"),
            })
            chart_home.append({
                "t": play.get("wallclock"),
                "p": play.get("period", {}).get("number") if isinstance(play.get("period"), dict) else None,
                "c": play.get("clock", {}).get("displayValue") if isinstance(play.get("clock"), dict) else None,
                "v": home_m,
            })

        # Build DB row for this play
        play_period = play.get("period", {}).get("number") if isinstance(play.get("period"), dict) else None
        play_clock = play.get("clock", {}).get("displayValue") if isinstance(play.get("clock"), dict) else None
        scored_play_rows.append((
            play_period,
            play_clock,
            play.get("wallclock"),
            (play.get("team") or {}).get("id"),
            team,
            play.get("text", ""),
            play.get("type", {}).get("text", "") if isinstance(play.get("type"), dict) else "",
            play.get("scoreValue") or 0,
            1 if play.get("shootingPlay") else 0,
            play.get("homeScore"),
            play.get("awayScore"),
            ps,
        ))

    # Final momentum
    raw_away = sum(away_window)
    raw_home = sum(home_window)
    away_m = to_momentum(raw_away)
    home_m = to_momentum(raw_home)

    # Trim chart
    chart_away = _trim_chart(chart_away)
    chart_home = _trim_chart(chart_home)

    # Recent plays (last 8, most recent first)
    recent = []
    for p, team in reversed(teamed_plays[-8:]):
        text = (p.get("text") or "").lower()
        play_type_text = p.get("type", {}).get("text", "") if isinstance(p.get("type"), dict) else ""
        recent.append({
            "clock": p.get("clock", {}).get("displayValue") if isinstance(p.get("clock"), dict) else None,
            "period": p.get("period", {}).get("number") if isinstance(p.get("period"), dict) else None,
            "text": p.get("text", ""),
            "team": team,
            "type": play_type_text,
            "isMake": "makes" in text,
            "isTurnover": "turnover" in play_type_text.lower() or "turnover" in text,
            "homeScore": p.get("homeScore"),
            "awayScore": p.get("awayScore"),
            "scoreValue": p.get("scoreValue"),
        })

    return {
        "away": away_m,
        "home": home_m,
        "chart_away": chart_away,
        "chart_home": chart_home,
        "recent_plays": recent,
        "scored_plays": scored_play_rows,
        "total_plays": len(plays),
        "total_teamed": len(teamed_plays),
    }


def _trim_chart(arr):
    """Trim chart to MAX_CHART_POINTS using even-interval downsampling."""
    if len(arr) <= MAX_CHART_POINTS:
        return arr
    step = len(arr) / MAX_CHART_POINTS
    return [arr[int(i * step)] for i in range(MAX_CHART_POINTS)]
