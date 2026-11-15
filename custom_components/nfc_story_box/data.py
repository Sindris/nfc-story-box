"""Runtime data shared by the integration's modules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from .const import DOMAIN
from .controller import StoryBox
from .store import CardStore


@dataclass
class RuntimeData:
    store: CardStore
    box: StoryBox


type StoryBoxConfigEntry = ConfigEntry[RuntimeData]


def loaded_entries(hass: HomeAssistant) -> list[StoryBoxConfigEntry]:
    return [e for e in hass.config_entries.async_entries(DOMAIN) if e.state is ConfigEntryState.LOADED]


def get_entry(hass: HomeAssistant, entry_id: str | None) -> StoryBoxConfigEntry:
    entries = loaded_entries(hass)
    if entry_id:
        entries = [e for e in entries if e.entry_id == entry_id]
    if not entries:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_set_up")
    return entries[0]


def entry_payload(entry: StoryBoxConfigEntry) -> dict[str, Any]:
    conf = {**entry.data, **entry.options}
    return {"entry_id": entry.entry_id, "title": entry.title, **{k: v for k, v in conf.items() if k != "import"}}
