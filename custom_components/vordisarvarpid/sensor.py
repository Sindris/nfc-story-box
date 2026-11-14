"""The card that is playing (or was played last)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .data import VordisConfigEntry
from .entity import VordisEntity


async def async_setup_entry(hass: HomeAssistant, entry: VordisConfigEntry, add: AddConfigEntryEntitiesCallback) -> None:
    add([CurrentCardSensor(entry)])


class CurrentCardSensor(VordisEntity, SensorEntity):
    _attr_icon = "mdi:card-text"

    def __init__(self, entry: VordisConfigEntry) -> None:
        super().__init__(entry, "current_card")

    @property
    def native_value(self) -> str | None:
        return (self.box.current or {}).get("name")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        cur, scan = self.box.current or {}, self.box.last_scan or {}
        return {
            "card_id": cur.get("card_id"),
            "tag_id": cur.get("tag_id"),
            "started": cur.get("started"),
            "last_scanned_tag": scan.get("tag_id"),
            "last_scan_known": scan.get("known"),
            "cards": len(self.box.store.cards),
        }
