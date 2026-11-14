"""Websocket API used by the card page."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send

from .const import SIGNAL_UPDATED
from .data import entry_payload, get_entry, loaded_entries

ENTRY = vol.Optional("entry_id")


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    for handler in (ws_list, ws_get, ws_save_cards, ws_update, ws_play, ws_stop, ws_subscribe):
        websocket_api.async_register_command(hass, handler)


def _state(hass: HomeAssistant, entry_id: str | None) -> dict[str, Any]:
    entry = get_entry(hass, entry_id)
    data, box = entry.runtime_data.store.snapshot(), entry.runtime_data.box
    ma = hass.config_entries.async_entries("music_assistant")
    return {
        "entry": entry_payload(entry),
        "music_assistant_entry_id": ma[0].entry_id if ma else None,
        "cards": data["cards"],
        "labels": data["labels"],
        "settings": data["settings"],
        "names": data["names"],
        "max_volume": data["max_volume"],
        "current": box.current,
        "last_scan": box.last_scan,
    }


def _guard(connection: websocket_api.ActiveConnection, msg: dict[str, Any], fn) -> Any:
    try:
        return fn()
    except Exception as err:  # noqa: BLE001 - reported to the page
        connection.send_error(msg["id"], "vordisarvarpid_error", str(err))
        return None


@websocket_api.websocket_command({vol.Required("type"): "vordisarvarpid/list"})
@callback
def ws_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    connection.send_result(msg["id"], [entry_payload(e) for e in loaded_entries(hass)])


@websocket_api.websocket_command({vol.Required("type"): "vordisarvarpid/get", ENTRY: str})
@callback
def ws_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    result = _guard(connection, msg, lambda: _state(hass, msg.get("entry_id")))
    if result is not None:
        connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "vordisarvarpid/save_cards", ENTRY: str, vol.Required("cards"): [dict]}
)
@callback
def ws_save_cards(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    entry = _guard(connection, msg, lambda: get_entry(hass, msg.get("entry_id")))
    if entry is None:
        return
    cards = entry.runtime_data.store.set_cards(msg["cards"])
    async_dispatcher_send(hass, SIGNAL_UPDATED.format(entry.entry_id))
    connection.send_result(msg["id"], {"cards": cards})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "vordisarvarpid/update",
        ENTRY: str,
        vol.Optional("labels"): dict,
        vol.Optional("settings"): dict,
        vol.Optional("names"): dict,
    }
)
@callback
def ws_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Label settings, print settings and remembered book names; anyone who can open the page may change these."""
    entry = _guard(connection, msg, lambda: get_entry(hass, msg.get("entry_id")))
    if entry is None:
        return
    store = entry.runtime_data.store
    if "labels" in msg:
        store.update_labels(msg["labels"])
    if "settings" in msg:
        store.update_settings(msg["settings"])
    if "names" in msg:
        store.update_names(msg["names"])
    async_dispatcher_send(hass, SIGNAL_UPDATED.format(entry.entry_id))
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "vordisarvarpid/play", ENTRY: str, vol.Required("card"): dict}
)
@websocket_api.async_response
async def ws_play(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Test-play a card (also one that is not saved yet) on the box's speaker."""
    try:
        entry = get_entry(hass, msg.get("entry_id"))
        await entry.runtime_data.box.async_play_card(msg["card"])
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "vordisarvarpid_error", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "vordisarvarpid/stop", ENTRY: str})
@websocket_api.async_response
async def ws_stop(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await get_entry(hass, msg.get("entry_id")).runtime_data.box.async_stop_playback()
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "vordisarvarpid_error", str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "vordisarvarpid/subscribe", ENTRY: str})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Tell the page when cards change, a card is scanned or something starts playing."""
    entry = _guard(connection, msg, lambda: get_entry(hass, msg.get("entry_id")))
    if entry is None:
        return
    box = entry.runtime_data.box

    @callback
    def forward() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"current": box.current, "last_scan": box.last_scan})
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_UPDATED.format(entry.entry_id), forward)
    connection.send_result(msg["id"])
