"""The card that is playing (or was played last), and how long the box has played today."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from homeassistant.util import dt as dt_util

from . import stats as statlib
from .data import VordisConfigEntry
from .entity import VordisEntity


async def async_setup_entry(hass: HomeAssistant, entry: VordisConfigEntry, add: AddConfigEntryEntitiesCallback) -> None:
    add([CurrentCardSensor(entry), ListenedTodaySensor(entry), ListenedWeekSensor(entry), MostPlayedSensor(entry)])


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
            "speaker": self.box.player,
            "last_scanned_tag": scan.get("tag_id"),
            "last_scan_known": scan.get("known"),
            "last_scan_blocked": scan.get("blocked"),
            "sleep_timer_until": self.box.sleep_until.isoformat(timespec="seconds") if self.box.sleep_until else None,
            "quiet_hours": self.box.quiet,
            "cards": len(self.box.store.cards),
        }


class ListenedTodaySensor(VordisEntity, SensorEntity):
    """Minutes played today; updated when playback starts or stops and every half minute while playing."""

    _attr_icon = "mdi:timer-music-outline"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_state_class = SensorStateClass.TOTAL_INCREASING

    def __init__(self, entry: VordisConfigEntry) -> None:
        super().__init__(entry, "listened_today")

    @property
    def native_value(self) -> int:
        return self.box.listened_today // 60

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        limit = self.box.daily_limit // 60
        return {"limit": limit or None, "limit_reached": self.box.limit_reached}


class ListenedWeekSensor(VordisEntity, SensorEntity):
    """Minutes played in the last 7 days (with the 7 days before as an attribute)."""

    _attr_icon = "mdi:chart-timeline-variant"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, entry: VordisConfigEntry) -> None:
        super().__init__(entry, "listened_week")

    def _summary(self) -> dict[str, Any]:
        return statlib.summary(self.box.store.data, dt_util.now().date(), 7)

    @property
    def native_value(self) -> int:
        return self._summary()["week"] // 60

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self._summary()
        return {"previous_week": data["prev_week"] // 60, "starts": data["starts"], "recording": self.box.conf.get("record_stats", True)}


class MostPlayedSensor(VordisEntity, SensorEntity):
    """The card played the most in the last 30 days."""

    _attr_icon = "mdi:trophy-outline"

    def __init__(self, entry: VordisConfigEntry) -> None:
        super().__init__(entry, "most_played")

    @property
    def native_value(self) -> str | None:
        return statlib.top_card(self.box.store.data, dt_util.now().date())[0]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        top = statlib.top_card(self.box.store.data, dt_util.now().date())[1]
        return {"top": [{"name": c["name"], "minutes": c["sec"] // 60} for c in top]}
