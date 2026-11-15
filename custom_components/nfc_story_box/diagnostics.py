"""Diagnostics: the settings and a summary of what is stored, without anything personal."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .const import VERSION
from .controller import play_items
from .data import StoryBoxConfigEntry


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: StoryBoxConfigEntry) -> dict[str, Any]:
    box, store = entry.runtime_data.box, entry.runtime_data.store
    conf = {k: v for k, v in box.conf.items() if k != "import"}
    players = {p for p in (conf.get("player"), box.player, store.data.get("speaker")) if p}
    return {
        "version": VERSION,
        "settings": conf,
        "speakers": {p: getattr(hass.states.get(p), "state", "missing") for p in players},
        "music_assistant": [e.state.value for e in hass.config_entries.async_entries("music_assistant")],
        "sound_service_found": bool(
            "." in str(conf.get("sound_service") or "") and hass.services.has_service(*str(conf["sound_service"]).split(".", 1))
        ),
        "cards": [
            {
                "has_tag": bool(c.get("tag_id")) and not str(c.get("tag_id")).startswith("VANTAR"),
                "media_type": c.get("media_type"),
                "items": len(play_items(c)),
                "sources": sorted({u.split("://", 1)[0].split("--", 1)[0] for u in play_items(c)}),
                **{k: c[k] for k in ("shuffle", "keep_playing", "remember", "next_each_time", "action", "start_volume") if c.get(k)},
                "own_speaker": bool(c.get("player")),
            }
            for c in store.cards
        ],
        "state": {
            "active": box._active,  # noqa: SLF001
            "current_card_known": box.current is not None,
            "last_scan": {k: v for k, v in (box.last_scan or {}).items() if k in ("known", "blocked", "time")},
            "listened_today": box.listened_today,
            "daily_limit": box.daily_limit,
            "quiet": box.quiet,
            "max_volume": box.base_max_volume,
            "positions": len(store.data["positions"]),
            "history": len(store.data["history"]),
            "labels": len(store.data["labels"]),
            "remembered_names": len(store.data["names"]),
        },
    }
