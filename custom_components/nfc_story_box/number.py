"""Highest volume the box's buttons may turn the speaker up to."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import MIN_VOLUME
from .data import StoryBoxConfigEntry
from .entity import StoryBoxEntity


async def async_setup_entry(hass: HomeAssistant, entry: StoryBoxConfigEntry, add: AddConfigEntryEntitiesCallback) -> None:
    add([MaxVolumeNumber(entry)])


class MaxVolumeNumber(StoryBoxEntity, NumberEntity):
    _attr_icon = "mdi:volume-high"
    _attr_native_min_value = MIN_VOLUME
    _attr_native_max_value = 1.0
    _attr_native_step = 0.05
    _attr_mode = NumberMode.SLIDER
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: StoryBoxConfigEntry) -> None:
        super().__init__(entry, "max_volume")

    @property
    def native_value(self) -> float:
        return self.box.base_max_volume

    async def async_set_native_value(self, value: float) -> None:
        await self.box.async_set_max_volume(value)
