"""Storage for Vordísarvarpið: the cards, label settings and print settings.

Everything lives in Home Assistant's own storage (.storage/vordisarvarpid.<entry_id>),
so it is included in backups and shared by every device that opens the card page.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_MAX_VOLUME, DOMAIN

STORAGE_VERSION = 1
SAVE_DELAY = 2

CARD_FIELDS = ("id", "name", "tag_id", "media_id", "media_type", "more_media", "shuffle", "media")
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
    if "more_media" in card:
        lines = [x.strip() for x in str(card["more_media"]).split("\n") if x.strip()]
        if lines:
            card["more_media"] = "\n".join(lines)
        else:
            del card["more_media"]
    card["shuffle"] = bool(raw.get("shuffle", False))
    return card


class VordisStore:
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
            "max_volume": DEFAULT_MAX_VOLUME,
        }

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        data = self._empty()
        if isinstance(loaded, dict):
            data.update({k: v for k, v in loaded.items() if k in data})
        data["cards"] = [clean_card(c) for c in data["cards"] if isinstance(c, dict)]
        self.data = data

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
        return next((c for c in self.cards if norm_tag(c.get("tag_id")) == want), None)

    def card_by_id(self, card_id: str) -> dict[str, Any] | None:
        return next((c for c in self.cards if c.get("id") == card_id), None)

    def set_cards(self, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cleaned = [clean_card(c) for c in cards]
        ids = {c["id"] for c in cleaned}
        # labels for deleted cards go too
        self.data["labels"] = {k: v for k, v in self.data["labels"].items() if k in ids}
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
