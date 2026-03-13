"""The Swing — ESPN API client."""

import time
import logging
from datetime import datetime, timezone

import requests

from .config import NBA_SCOREBOARD, CBB_SCOREBOARD, NBA_SUMMARY, CBB_SUMMARY

logger = logging.getLogger(__name__)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "TheSwing/1.0"})
REQUEST_TIMEOUT = 10


def _fetch_json(url, retries=1):
    """Fetch JSON from a URL with cache-busting and retry."""
    sep = "&" if "?" in url else "?"
    full_url = f"{url}{sep}_t={int(time.time() * 1000)}"

    for attempt in range(retries + 1):
        try:
            resp = SESSION.get(full_url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            if attempt < retries:
                time.sleep(1)
                continue
            logger.warning("Failed to fetch %s: %s", url, e)
            return None


def fetch_nba_scoreboard(date_str=None):
    """Fetch NBA scoreboard. Optional date_str in YYYYMMDD format."""
    url = NBA_SCOREBOARD
    if date_str:
        url += f"?dates={date_str}"
    data = _fetch_json(url)
    if not data:
        return []
    return data.get("events", [])


def fetch_cbb_scoreboard(date_str=None):
    """Fetch NCAA CBB scoreboard. Optional date_str in YYYYMMDD format."""
    if not date_str:
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y%m%d")
    url = f"{CBB_SCOREBOARD}?dates={date_str}&groups=50&limit=200"
    data = _fetch_json(url)
    if not data:
        return []
    return data.get("events", [])


def fetch_game_summary(game_id, league):
    """Fetch play-by-play detail for a specific game."""
    if league == "NBA":
        url = NBA_SUMMARY.format(game_id=game_id)
    else:
        url = CBB_SUMMARY.format(game_id=game_id)
    data = _fetch_json(url)
    if not data:
        return None
    return data


def parse_scoreboard_event(event, league):
    """Parse an ESPN scoreboard event into a normalized game dict.

    Mirrors the JS parseScoreboard() function.
    """
    comp = (event.get("competitions") or [{}])[0]
    competitors = comp.get("competitors", [])

    home = next((c for c in competitors if c.get("homeAway") == "home"), {})
    away = next((c for c in competitors if c.get("homeAway") == "away"), {})

    home_team = home.get("team", {})
    away_team = away.get("team", {})

    status_obj = event.get("status", {})
    status = status_obj.get("type", {}).get("name", "")

    broadcasts = comp.get("broadcasts", [])
    network = ""
    if broadcasts:
        names = broadcasts[0].get("names", [])
        if names:
            network = names[0]
        elif broadcasts[0].get("media", {}).get("shortName"):
            network = broadcasts[0]["media"]["shortName"]

    venue_obj = comp.get("venue", {})
    venue = ""
    if venue_obj:
        parts = [venue_obj.get("fullName", "")]
        city = venue_obj.get("address", {}).get("city", "")
        if city:
            parts.append(city)
        venue = ", ".join(p for p in parts if p)

    # Extract game date
    game_date = event.get("date", "")[:10]  # YYYY-MM-DD

    return {
        "id": event.get("id", ""),
        "league": league,
        "game_date": game_date,
        "name": event.get("name", ""),
        "short_name": event.get("shortName", ""),
        "status": status,
        "period": status_obj.get("period"),
        "clock": status_obj.get("displayClock"),
        "date": event.get("date", ""),
        "away_abbr": away_team.get("abbreviation", "???"),
        "home_abbr": home_team.get("abbreviation", "???"),
        "away_id": away_team.get("id"),
        "home_id": home_team.get("id"),
        "away_name": away_team.get("displayName", ""),
        "home_name": home_team.get("displayName", ""),
        "away_color": "#" + (away_team.get("color") or "555555"),
        "home_color": "#" + (home_team.get("color") or "555555"),
        "away_score": int(away.get("score", 0) or 0),
        "home_score": int(home.get("score", 0) or 0),
        "network": network,
        "venue": venue,
        "mom": None,
    }


def get_plays_from_summary(summary):
    """Extract the plays array from an ESPN summary response."""
    if not summary:
        return []
    # ESPN puts plays at different locations depending on the sport/endpoint
    plays = summary.get("plays", [])
    if not plays:
        # Some responses nest plays differently
        plays = summary.get("playByPlay", {}).get("plays", []) if isinstance(summary.get("playByPlay"), dict) else []
    return plays
