"""The Swing — Alert detection (Python port of detectAlerts)."""

from .config import ALERT_THRESHOLDS, LIVE_STATUSES


def detect_alerts(game):
    """Evaluate three-tier alert system for a game.

    Args:
        game: dict with keys: status, away_score, home_score,
              and mom dict with keys: away, home

    Returns:
        dict with: bluffing (bool), comeback (bool), swing_warning (bool)
    """
    mom = game.get("mom")
    if not mom:
        return {"bluffing": False, "comeback": False, "swing_warning": False}

    away = mom["away"]
    home = mom["home"]
    swing_gap = abs(away - home)
    score_diff = game["away_score"] - game["home_score"]
    away_leads_score = score_diff > 0
    away_leads_swing = away > home
    is_live = game["status"] in LIVE_STATUSES
    is_ht = game["status"] == "STATUS_HALFTIME"

    # Adaptive thresholds
    ctx = "ht" if is_ht else "live"
    bluff_mom_thresh = ALERT_THRESHOLDS["bluff_mom"][ctx]
    bluff_score_thresh = ALERT_THRESHOLDS["bluff_score"][ctx]
    comeback_mom_lead = ALERT_THRESHOLDS["comeback_mom"][ctx]
    comeback_score_gap = ALERT_THRESHOLDS["comeback_score"][ctx]

    # Tier 1: SCORE IS BLUFFING
    bluffing = (
        is_live
        and swing_gap >= bluff_mom_thresh
        and abs(score_diff) >= bluff_score_thresh
        and away_leads_score != away_leads_swing
    )

    # Tier 2: COMEBACK WATCH
    if score_diff > 0:
        trailing_leads_swing = home > away + comeback_mom_lead
    else:
        trailing_leads_swing = away > home + comeback_mom_lead

    comeback = (
        is_live
        and not bluffing
        and abs(score_diff) >= comeback_score_gap
        and trailing_leads_swing
    )

    # Tier 3: SWING WARNING
    swing_warning = (
        is_live
        and not bluffing
        and not comeback
        and abs(score_diff) < bluff_score_thresh
        and swing_gap >= ALERT_THRESHOLDS["swing_gap"]
    )

    return {"bluffing": bluffing, "comeback": comeback, "swing_warning": swing_warning}
