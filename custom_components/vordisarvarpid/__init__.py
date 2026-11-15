"""Vordísarvarpið: an NFC music and story player for children, with printable card labels."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.typing import ConfigType

from .config_flow import automation_entity
from .const import (
    CARD_FILE,
    CONF_DAILY_LIMIT,
    CONF_PAUSE_ON_REMOVE,
    CONF_QUIET_END,
    CONF_QUIET_MAX_VOLUME,
    CONF_QUIET_START,
    CONF_QUIET_STORIES_ONLY,
    CONF_RECORD_STATS,
    CONF_RESUME_SAME_CARD,
    CONF_SUMMARY_NOTIFY,
    CONF_ONLY_SPEAKER,
    CONF_PHONE_SCAN,
    DOMAIN,
    FRONTEND_URL,
    LOADER_FILE,
    SIGNAL_UPDATED,
)
from .controller import VordisBox
from .data import VordisConfigEntry, VordisData, get_entry
from .store import VordisStore, norm_tag
from .websocket import async_register_websocket

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.NUMBER, Platform.SENSOR, Platform.SWITCH]

# Options the box reads live; changing only these needs no reload.
LIVE_OPTIONS = {
    CONF_PAUSE_ON_REMOVE, CONF_RESUME_SAME_CARD, CONF_QUIET_START, CONF_QUIET_END,
    CONF_QUIET_MAX_VOLUME, CONF_QUIET_STORIES_ONLY, CONF_DAILY_LIMIT, CONF_RECORD_STATS, CONF_SUMMARY_NOTIFY, CONF_ONLY_SPEAKER,
    CONF_PHONE_SCAN,
}
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the card page, register the websocket API and the actions."""
    card = Path(__file__).parent / "frontend" / CARD_FILE
    digest = await hass.async_add_executor_job(
        lambda: hashlib.sha256(b"".join(f.read_bytes() for f in sorted(card.parent.glob("*.js")))).hexdigest()[:8]
    )
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(card.parent), cache_headers=False)]
    )
    # A tiny loader goes on every dashboard, so "custom:vordisarvarpid-kortamidar-card" works without a
    # resource entry; the card page itself is only fetched where the card is shown.
    add_extra_js_url(hass, f"{FRONTEND_URL}/{LOADER_FILE}?v={digest}")
    async_register_websocket(hass)

    async def play_card(call: ServiceCall) -> None:
        entry = get_entry(hass, call.data.get("entry_id"))
        store, box = entry.runtime_data.store, entry.runtime_data.box
        want = str(call.data["card"]).strip()
        card = store.card_for_tag(want) or next(
            (c for c in store.cards if c["name"].casefold() == want.casefold() or c["id"] == want), None
        )
        if card is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_card",
                translation_placeholders={"card": want},
            )
        if card.get("action"):
            await box.async_run_action(card)
        else:
            await box.async_play_card(card)

    async def stop(call: ServiceCall) -> None:
        await get_entry(hass, call.data.get("entry_id")).runtime_data.box.async_stop_playback()

    hass.services.async_register(
        DOMAIN, "play_card", play_card,
        schema=vol.Schema({vol.Required("card"): cv.string, vol.Optional("entry_id"): cv.string}),
    )
    hass.services.async_register(DOMAIN, "stop", stop, schema=vol.Schema({vol.Optional("entry_id"): cv.string}))

    async def sleep_timer(call: ServiceCall) -> None:
        await get_entry(hass, call.data.get("entry_id")).runtime_data.box.async_sleep_timer(call.data["minutes"])

    async def set_speaker(call: ServiceCall) -> None:
        await get_entry(hass, call.data.get("entry_id")).runtime_data.box.async_set_speaker(call.data.get("player"))

    hass.services.async_register(
        DOMAIN, "sleep_timer", sleep_timer,
        schema=vol.Schema({
            vol.Required("minutes"): vol.All(vol.Coerce(int), vol.Range(min=0, max=240)),
            vol.Optional("entry_id"): cv.string,
        }),
    )
    async def weekly_summary(call: ServiceCall) -> None:
        await get_entry(hass, call.data.get("entry_id")).runtime_data.box.async_send_summary()

    hass.services.async_register(
        DOMAIN, "weekly_summary", weekly_summary, schema=vol.Schema({vol.Optional("entry_id"): cv.string}),
    )
    hass.services.async_register(
        DOMAIN, "set_speaker", set_speaker,
        schema=vol.Schema({vol.Optional("player"): cv.entity_id, vol.Optional("entry_id"): cv.string}),
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: VordisConfigEntry) -> bool:
    store = VordisStore(hass, entry.entry_id)
    await store.async_load()

    # one-time move of the cards etc. from the old blueprint automation
    imported = entry.data.get("import")
    if isinstance(imported, dict):
        if imported.get("cards") and not store.cards:
            store.set_cards(imported["cards"])
        store.data["max_volume"] = imported.get("max_volume") or store.data["max_volume"]
        if imported.get("last_tag"):
            store.data["last_tag"] = norm_tag(imported["last_tag"])
        await store.async_save_now()
        if imported.get("disable_automation") and (ent := automation_entity(hass, imported.get("automation_id"))):
            try:
                await hass.services.async_call("automation", "turn_off", {"entity_id": ent, "stop_actions": False}, blocking=True)
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Could not turn off %s: %s", ent, err)
        data = {k: v for k, v in entry.data.items() if k != "import"}
        hass.config_entries.async_update_entry(entry, data=data)

    box = VordisBox(hass, entry, store)
    entry.runtime_data = VordisData(store, box)
    box.async_start()
    entry.async_on_unload(box.async_stop)
    box.applied_options = dict(entry.options)
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _options_updated(hass: HomeAssistant, entry: VordisConfigEntry) -> None:
    box = entry.runtime_data.box
    old, new = box.applied_options, dict(entry.options)
    changed = {k for k in old.keys() | new.keys() if old.get(k) != new.get(k)}
    if changed and changed <= LIVE_OPTIONS:
        box.applied_options = new
        async_dispatcher_send(hass, SIGNAL_UPDATED.format(entry.entry_id))
        return
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: VordisConfigEntry) -> bool:
    await entry.runtime_data.store.async_save_now()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await VordisStore(hass, entry.entry_id).async_remove()
