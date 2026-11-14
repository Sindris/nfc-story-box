"""Switches for settings that are handy to flip from a dashboard."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import CONF_PAUSE_ON_REMOVE
from .data import VordisConfigEntry
from .entity import VordisEntity


async def async_setup_entry(hass: HomeAssistant, entry: VordisConfigEntry, add: AddConfigEntryEntitiesCallback) -> None:
    add([OptionSwitch(entry, CONF_PAUSE_ON_REMOVE, "mdi:pause-circle-outline", default=True)])


class OptionSwitch(VordisEntity, SwitchEntity):
    """A switch backed by one of the integration's options, so it and the options form never disagree."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, entry: VordisConfigEntry, option: str, icon: str, *, default: bool) -> None:
        super().__init__(entry, option)
        self._option, self._default = option, default
        self._attr_icon = icon

    @property
    def is_on(self) -> bool:
        return bool(self.box.conf.get(self._option, self._default))

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._set(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._set(False)

    def _set(self, value: bool) -> None:
        self.hass.config_entries.async_update_entry(self.entry, options={**self.entry.options, self._option: value})
