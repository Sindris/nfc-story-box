"""Storage for NFC Story Box: the cards, label settings and print settings.

Everything lives in Home Assistant's own storage (.storage/nfc_story_box.<entry_id>),
so it is included in backups and shared by every device that opens the card page.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from . import stats
from .const import ACTIONS, DEFAULT_MAX_VOLUME, DOMAIN, STORY_TYPES

STORAGE_VERSION = 1
SAVE_DELAY = 2

CARD_FIELDS = (
    "id", "name", "tag_id", "more_tags", "no_label", "media_id", "media_type", "more_media", "shuffle", "keep_playing", "media",
    "remember", "next_each_time", "player", "start_volume", "action", "minutes",
)
MAX_NAMES = 5000


def norm_tag(tag: Any) -> str:
    """Tag ids are compared without case or surrounding spaces."""
    return str(tag or "").strip().upper()


def clean_card(raw: dict[str, Any]) -> dict[str, Any]:
    """Keep the known fields of a card and give it a stable id."""
    card = {k: raw[k] for k in CARD_FIELDS if k in raw and raw[k] not in (None, "")}
    card["id"] = str(raw.get("id") or uuid.uuid4().hex[:12])
    card["name"] = str(card.get("name") or "").strip()
    card["tag_id"] = str(card.get("tag_id") or "").strip()
    # more NFC cards or chips that start the same card (one id per line)
    raw_tags = raw.get("more_tags") or ""
    if isinstance(raw_tags, (list, tuple)):
        raw_tags = "\n".join(str(x) for x in raw_tags)
    seen = {norm_tag(card["tag_id"])}
    extra: list[str] = []
    for line in str(raw_tags).split("\n"):
        tag = line.strip()
        if tag and norm_tag(tag) not in seen:
            seen.add(norm_tag(tag))
            extra.append(tag)
    if extra:
        card["more_tags"] = "\n".join(extra)
    else:
        card.pop("more_tags", None)
    # a chip glued to a book or toy: nothing to print a label for
    if raw.get("no_label"):
        card["no_label"] = True
    else:
        card.pop("no_label", None)
    if "more_media" in card:
        lines = [x.strip() for x in str(card["more_media"]).split("\n") if x.strip()]
        if lines:
            card["more_media"] = "\n".join(lines)
        else:
            del card["more_media"]
    card["shuffle"] = bool(raw.get("shuffle", False))
    # keep playing when this card is lifted off the box (default: pause)
    card["keep_playing"] = bool(raw.get("keep_playing", False))
    # optional extras: only kept when they say something
    if isinstance(raw.get("remember"), bool):
        card["remember"] = raw["remember"]
    else:
        card.pop("remember", None)
    if raw.get("next_each_time"):
        card["next_each_time"] = True
    else:
        card.pop("next_each_time", None)
    try:
        volume = float(raw.get("start_volume") or 0)
    except (TypeError, ValueError):
        volume = 0
    if 0 < volume <= 1:
        card["start_volume"] = round(volume, 2)
    else:
        card.pop("start_volume", None)
    if raw.get("action") in ACTIONS:
        card["action"] = raw["action"]
        try:
            card["minutes"] = max(1, min(240, int(raw.get("minutes") or 0))) if raw.get("minutes") else None
        except (TypeError, ValueError):
            card["minutes"] = None
        if card["minutes"] is None:
            del card["minutes"]
    else:
        card.pop("action", None)
        card.pop("minutes", None)
    return card


def card_tags(card: dict[str, Any]) -> list[str]:
    """Every NFC tag id that starts this card (the first one, then any more)."""
    tags = [str(card.get("tag_id") or "").strip()]
    tags += [t.strip() for t in str(card.get("more_tags") or "").split("\n")]
    return [t for t in tags if t]


def is_story(card: dict[str, Any]) -> bool:
    return (card.get("media_type") or "") in STORY_TYPES


def remembers(card: dict[str, Any]) -> bool:
    """Whether the card continues where it stopped: stories do unless switched off, music only if asked."""
    value = card.get("remember")
    return value if isinstance(value, bool) else is_story(card)


class CardStore:
    """Holds and saves the data for one box."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")
        self.data: dict[str, Any] = self._empty()

    @staticmethod
    def _empty() -> dict[str, Any]:
        return {
            "cards": [],
            "labels": {},
            "settings": {},
            "names": {},
            "last_tag": None,
            "last_player": None,
            "max_volume": DEFAULT_MAX_VOLUME,
            "speaker": None,       # speaker chosen with a "speaker" control card (None = the one in the settings)
            "positions": {},       # card id -> {index, elapsed, time}: where a story stopped
            "series_next": {},     # card id -> which book a "next book each time" card plays next
            "history": {},         # card id -> {count, last, seconds}
            "usage": {},           # {date, seconds}: listening today
            "stats": {},           # per-day listening log, see stats.py
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        data = self._empty()
        if isinstance(loaded, dict):
            data.update({k: v for k, v in loaded.items() if k in data})
        data["cards"] = [clean_card(c) for c in data["cards"] if isinstance(c, dict)]
        stats.ensure(data)
        self.data = data

    def import_data(self, raw: dict[str, Any]) -> None:
        """Merge an earlier copy of the stored data (cards, labels, history, ...) into this box."""
        for key, value in raw.items():
            if key in self.data and key != "cards" and value is not None:
                self.data[key] = value
        if isinstance(raw.get("cards"), list):
            self.data["cards"] = [clean_card(c) for c in raw["cards"] if isinstance(c, dict)]
        stats.ensure(self.data)
        self.schedule_save()

    def schedule_save(self) -> None:
        self._store.async_delay_save(lambda: self.data, SAVE_DELAY)

    async def async_save_now(self) -> None:
        await self._store.async_save(self.data)

    async def async_remove(self) -> None:
        await self._store.async_remove()

    # ---- cards
    @property
    def cards(self) -> list[dict[str, Any]]:
        return self.data["cards"]

    def card_for_tag(self, tag: str) -> dict[str, Any] | None:
        want = norm_tag(tag)
        if not want:
            return None
        return next((c for c in self.cards if want in {norm_tag(t) for t in card_tags(c)}), None)

    def card_by_id(self, card_id: str) -> dict[str, Any] | None:
        return next((c for c in self.cards if c.get("id") == card_id), None)

    def set_cards(self, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cleaned = [clean_card(c) for c in cards]
        ids = {c["id"] for c in cleaned}
        # labels for deleted cards go too
        for key in ("labels", "positions", "series_next", "history"):
            self.data[key] = {k: v for k, v in self.data[key].items() if k in ids}
        self.data["cards"] = cleaned
        self.schedule_save()
        return cleaned

    # ---- labels, settings, names
    def update_labels(self, labels: dict[str, Any]) -> None:
        current = self.data["labels"]
        for card_id, value in labels.items():
            if value is None:
                current.pop(card_id, None)
            elif isinstance(value, dict):
                merged = {**current.get(card_id, {}), **value}
                current[card_id] = {k: v for k, v in merged.items() if v is not None}
        self.schedule_save()

    def update_settings(self, settings: dict[str, Any]) -> None:
        self.data["settings"] = {**self.data["settings"], **settings}
        self.schedule_save()

    def update_names(self, names: dict[str, Any]) -> None:
        current = self.data["names"]
        for uri, value in names.items():
            if isinstance(value, dict) and value.get("name"):
                current[uri] = {"name": str(value["name"]), "image": str(value.get("image") or "")}
        if len(current) > MAX_NAMES:
            for key in list(current)[: len(current) - MAX_NAMES]:
                del current[key]
        self.schedule_save()

    def snapshot(self) -> dict[str, Any]:
        return deepcopy(self.data)
