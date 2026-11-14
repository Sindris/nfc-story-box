"""Runtime data shared by the integration's modules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from .const import DOMAIN
from .controller import VordisBox
from .store import VordisStore


@dataclass
class VordisData:
    store: VordisStore
    box: VordisBox


type VordisConfigEntry = ConfigEntry[VordisData]


def loaded_entries(hass: HomeAssistant) -> list[VordisConfigEntry]:
    return [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]


def get_entry(hass: HomeAssistant, entry_id: str | None) -> VordisConfigEntry:
    entries = loaded_entries(hass)
    if entry_id:
        entries = [e for e in entries if e.entry_id == entry_id]
    if not entries:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_set_up")
    return entries[0]


def entry_payload(entry: VordisConfigEntry) -> dict[str, Any]:
    conf = {**entry.data, **entry.options}
    return {"entry_id": entry.entry_id, "title": entry.title, **{k: v for k, v in conf.items() if k != "import"}}
