"""Listening statistics: a small per-day log kept in the box's storage, and the numbers made from it."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from .const import MAX_PLAYS, STATS_DAYS

SHORT_PLAY = 30  # a play shorter than this many seconds counts as "lifted straight away"


def empty() -> dict[str, Any]:
    return {"days": {}, "plays": [], "names": {}, "since": None}


def ensure(data: dict[str, Any]) -> dict[str, Any]:
    """The stats block of the stored data, created or repaired if needed."""
    stats = data.get("stats")
    if not isinstance(stats, dict):
        stats = data["stats"] = empty()
    for key, default in empty().items():
        if not isinstance(stats.get(key), type(default)) and not (key == "since" and stats.get(key) is None):
            stats[key] = default
    return stats


def record_time(
    data: dict[str, Any], *, day: str, hour: int, seconds: float, card: dict[str, Any] | None,
    player: str | None, story: bool, now_iso: str,
) -> None:
    """Add played seconds to today's log (called every time playing time is accounted)."""
    if seconds <= 0:
        return
    stats = ensure(data)
    stats["since"] = stats.get("since") or now_iso
    rec = stats["days"].setdefault(day, {"s": 0, "m": 0, "t": 0, "n": 0, "c": {}, "h": {}, "p": {}})
    rec["s"] = round(rec.get("s", 0) + seconds, 1)
    kind = "t" if story else "m"
    rec[kind] = round(rec.get(kind, 0) + seconds, 1)
    rec["h"][str(hour)] = round(rec["h"].get(str(hour), 0) + seconds, 1)
    if player:
        rec["p"][player] = round(rec["p"].get(player, 0) + seconds, 1)
    if card and card.get("id"):
        rec["c"][card["id"]] = round(rec["c"].get(card["id"], 0) + seconds, 1)
        stats["names"][card["id"]] = card.get("name") or stats["names"].get(card["id"]) or ""
    if len(stats["days"]) > STATS_DAYS:
        for old in sorted(stats["days"])[: len(stats["days"]) - STATS_DAYS]:
            del stats["days"][old]


def record_start(data: dict[str, Any], *, day: str, card: dict[str, Any], player: str, now_iso: str) -> dict[str, Any]:
    """A card started playing: one entry in the recent plays; returns it so its time can be added to."""
    stats = ensure(data)
    stats["since"] = stats.get("since") or now_iso
    rec = stats["days"].setdefault(day, {"s": 0, "m": 0, "t": 0, "n": 0, "c": {}, "h": {}, "p": {}})
    rec["n"] = int(rec.get("n", 0)) + 1
    entry = {"t": now_iso, "id": card.get("id"), "name": card.get("name") or "", "p": player, "sec": 0}
    stats["plays"].append(entry)
    del stats["plays"][: max(0, len(stats["plays"]) - MAX_PLAYS)]
    if card.get("id"):
        stats["names"][card["id"]] = card.get("name") or ""
    return entry


def reset(data: dict[str, Any]) -> None:
    data["stats"] = empty()


def _sum(days: dict[str, Any], start: date, end: date, key: str = "s") -> float:
    total, cur = 0.0, start
    while cur <= end:
        total += float((days.get(cur.isoformat()) or {}).get(key, 0))
        cur += timedelta(days=1)
    return total


def summary(data: dict[str, Any], today: date, span: int = 30) -> dict[str, Any]:
    """Everything the statistics card shows, for the last `span` days."""
    stats = ensure(data)
    days = stats["days"]
    cards = {c["id"]: c for c in data.get("cards", []) if c.get("id")}
    history = data.get("history", {})
    start = today - timedelta(days=span - 1)

    series = []
    cur = start
    while cur <= today:
        rec = days.get(cur.isoformat()) or {}
        series.append({"d": cur.isoformat(), "s": round(rec.get("s", 0)), "m": round(rec.get("m", 0)), "t": round(rec.get("t", 0))})
        cur += timedelta(days=1)

    per_card: dict[str, float] = {}
    per_player: dict[str, float] = {}
    heat = [[0.0] * 24 for _ in range(7)]
    starts = 0
    listening_days = 0
    cur = start
    while cur <= today:
        rec = days.get(cur.isoformat()) or {}
        if rec.get("s"):
            listening_days += 1
        starts += int(rec.get("n", 0))
        for cid, sec in (rec.get("c") or {}).items():
            per_card[cid] = per_card.get(cid, 0) + sec
        for pl, sec in (rec.get("p") or {}).items():
            per_player[pl] = per_player.get(pl, 0) + sec
        for hour, sec in (rec.get("h") or {}).items():
            try:
                heat[cur.weekday()][int(hour)] += sec
            except (ValueError, IndexError):
                pass
        cur += timedelta(days=1)

    shorts: dict[str, int] = {}
    for play in stats["plays"]:
        if play.get("id") and float(play.get("sec") or 0) < SHORT_PLAY:
            shorts[play["id"]] = shorts.get(play["id"], 0) + 1

    ranked = []
    for cid, sec in sorted(per_card.items(), key=lambda kv: -kv[1]):
        hist = history.get(cid) or {}
        ranked.append({
            "id": cid, "name": (cards.get(cid) or {}).get("name") or stats["names"].get(cid) or "?",
            "gone": cid not in cards, "sec": round(sec), "count": int(hist.get("count") or 0),
            "last": hist.get("last"), "short": shorts.get(cid, 0),
        })

    week = _sum(days, today - timedelta(days=6), today)
    prev_week = _sum(days, today - timedelta(days=13), today - timedelta(days=7))
    quiet = [  # cards never played, or not for a long time
        {"id": cid, "name": c.get("name") or "?", "last": (history.get(cid) or {}).get("last"), "count": int((history.get(cid) or {}).get("count") or 0)}
        for cid, c in cards.items() if not c.get("action")
    ]
    return {
        "span": span,
        "since": stats.get("since"),
        "today": round(float((days.get(today.isoformat()) or {}).get("s", 0))),
        "week": round(week),
        "prev_week": round(prev_week),
        "total": round(sum(s["s"] for s in series)),
        "average": round(sum(s["s"] for s in series) / max(1, listening_days)),
        "listening_days": listening_days,
        "starts": starts,
        "series": series,
        "cards": ranked,
        "music": round(sum(s["m"] for s in series)),
        "stories": round(sum(s["t"] for s in series)),
        "heat": [[round(v) for v in row] for row in heat],
        "players": [{"entity_id": p, "sec": round(s)} for p, s in sorted(per_player.items(), key=lambda kv: -kv[1])],
        "unplayed": quiet,
        "recent": [dict(p) for p in reversed(stats["plays"][-12:])],
        "positions": data.get("positions", {}),
    }


def top_card(data: dict[str, Any], today: date, span: int = 30) -> tuple[str | None, list[dict[str, Any]]]:
    cards = summary(data, today, span)["cards"]
    return (cards[0]["name"] if cards else None), cards[:3]
