"""Tests for Vordísarvarpið, run against a real Home Assistant core."""

from __future__ import annotations

import pytest
import yaml

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component

from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.vordisarvarpid.const import DOMAIN, EVENT_CARD_SCANNED

PLAYER = "media_player.vordis"
CARDS = [
    {"name": "Vordís Partí", "tag_id": "89-4A-71-E6", "media_id": "library://playlist/14", "media_type": "playlist", "shuffle": False},
    {"name": "Lína langsokkur", "tag_id": "AA-BB", "media_id": "library://audiobook/62", "media_type": "audiobook",
     "more_media": "library://audiobook/67\nlibrary://audiobook/27", "shuffle": False},
]


@pytest.fixture(autouse=True)
def auto_enable(enable_custom_integrations):
    yield


@pytest.fixture
def reader(hass: HomeAssistant):
    esp = MockConfigEntry(domain="esphome", title="nfc-reader", data={"device_name": "nfc-reader"})
    esp.add_to_hass(hass)
    return dr.async_get(hass).async_get_or_create(
        config_entry_id=esp.entry_id, identifiers={("esphome", "48:3F")}, name="nfc-reader"
    )


@pytest.fixture
def calls(hass: HomeAssistant):
    return {
        "ma_play": async_mock_service(hass, "music_assistant", "play_media"),
        "play": async_mock_service(hass, "media_player", "media_play"),
        "pause": async_mock_service(hass, "media_player", "media_pause"),
        "volume": async_mock_service(hass, "media_player", "volume_set"),
        "shuffle": async_mock_service(hass, "media_player", "shuffle_set"),
        "repeat": async_mock_service(hass, "media_player", "repeat_set"),
        "playpause": async_mock_service(hass, "media_player", "media_play_pause"),
        "next": async_mock_service(hass, "media_player", "media_next_track"),
        "sound": async_mock_service(hass, "esphome", "nfc_reader_play_sound"),
        "auto_off": async_mock_service(hass, "automation", "turn_off"),
    }


async def _setup(hass: HomeAssistant, reader, **opts) -> MockConfigEntry:
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5})
    entry = MockConfigEntry(
        domain=DOMAIN, title="Vordísarvarpið", unique_id=reader.id,
        data={
            "reader_device": reader.id, "player": PLAYER, "button_event": "event.vordis_button",
            "card_present": "binary_sensor.vordis_card", "start_volume": 0.3, "volume_step": 0.1,
            "pause_on_remove": True, "resume_same_card": True, "sound_service": "esphome.nfc_reader_play_sound",
            **opts,
        },
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    entry.runtime_data.store.set_cards(CARDS)
    return entry


async def _scan(hass: HomeAssistant, reader, tag: str) -> None:
    hass.bus.async_fire("tag_scanned", {"tag_id": tag, "device_id": reader.id})
    await hass.async_block_till_done()


async def test_known_card_plays_and_beeps(hass, reader, calls):
    entry = await _setup(hass, reader)
    seen = []
    hass.bus.async_listen(EVENT_CARD_SCANNED, lambda e: seen.append(e.data))
    await _scan(hass, reader, "89-4a-71-e6")
    assert calls["sound"][-1].data == {"sound": "success"}
    assert calls["volume"][-1].data["volume_level"] == 0.3
    assert calls["shuffle"][-1].data["shuffle"] is False
    play = calls["ma_play"][-1].data
    assert play["media_id"] == "library://playlist/14" and play["media_type"] == "playlist" and play["enqueue"] == "replace"
    assert seen[-1]["known"] is True and seen[-1]["name"] == "Vordís Partí"
    assert hass.states.get("sensor.vordisarvarpid_card_playing").state == "Vordís Partí"
    assert entry.runtime_data.store.data["last_tag"] == "89-4A-71-E6"


async def test_series_queues_all_books(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "AA-BB")
    play = calls["ma_play"][-1].data
    assert play["media_id"] == ["library://audiobook/62", "library://audiobook/67", "library://audiobook/27"]
    assert play["media_type"] == "audiobook"


async def test_same_card_resumes_when_paused(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "AA-BB")
    hass.states.async_set(PLAYER, "paused", {"volume_level": 0.5})
    await _scan(hass, reader, "AA-BB")
    assert len(calls["play"]) == 1 and len(calls["ma_play"]) == 1


async def test_unavailable_speaker_does_not_count_as_last_card(hass, reader, calls):
    """A scan while the speaker is unusable must not make the next scan 'resume' other media."""
    entry = await _setup(hass, reader)
    hass.states.async_set(PLAYER, "unavailable")
    await _scan(hass, reader, "89-4A-71-E6")
    assert not calls["ma_play"] and entry.runtime_data.store.data["last_tag"] is None
    hass.states.async_set(PLAYER, "paused", {"volume_level": 0.5})  # something else is paused there
    await _scan(hass, reader, "89-4A-71-E6")
    assert not calls["play"] and calls["ma_play"][-1].data["media_id"] == "library://playlist/14"


async def test_other_card_started_in_between_is_not_resumed(hass, reader, calls):
    """Card A, then card B from the page/service, then card A on the box: play A fresh, don't resume B."""
    entry = await _setup(hass, reader)
    await _scan(hass, reader, "89-4A-71-E6")
    await hass.services.async_call(DOMAIN, "play_card", {"card": "Lína langsokkur"}, blocking=True)
    hass.states.async_set(PLAYER, "paused", {"volume_level": 0.5})
    await _scan(hass, reader, "89-4A-71-E6")
    assert not calls["play"] and calls["ma_play"][-1].data["media_id"] == "library://playlist/14"


async def test_new_speaker_is_not_resumed(hass, reader, calls):
    entry = await _setup(hass, reader)
    await _scan(hass, reader, "AA-BB")
    entry.runtime_data.store.data["last_player"] = "media_player.somewhere_else"
    hass.states.async_set(PLAYER, "paused", {"volume_level": 0.5})
    await _scan(hass, reader, "AA-BB")
    assert not calls["play"] and len(calls["ma_play"]) == 2


async def test_unknown_card_and_other_reader(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "NOPE")
    assert calls["sound"][-1].data == {"sound": "unknown"} and not calls["ma_play"]
    hass.bus.async_fire("tag_scanned", {"tag_id": "AA-BB", "device_id": "another-device"})
    await hass.async_block_till_done()
    assert not calls["ma_play"]


async def test_buttons_and_volume_limits(hass, reader, calls):
    entry = await _setup(hass, reader)
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:00", {"event_type": "volume_up"})
    await hass.async_block_till_done()
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:01", {"event_type": "volume_up"})
    await hass.async_block_till_done()
    assert calls["volume"][-1].data["volume_level"] == 0.6  # 0.5 + 0.1, capped at max 0.6
    await hass.services.async_call("number", "set_value", {"entity_id": "number.vordisarvarpid_max_volume", "value": 0.55}, blocking=True)
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:02", {"event_type": "volume_up"})
    await hass.async_block_till_done()
    assert calls["volume"][-1].data["volume_level"] == 0.55
    assert entry.runtime_data.store.data["max_volume"] == 0.55
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:03", {"event_type": "next"})
    await hass.async_block_till_done()
    assert len(calls["next"]) == 1


async def test_lifting_card_pauses(hass, reader, calls):
    await _setup(hass, reader)
    hass.states.async_set("binary_sensor.vordis_card", "on")
    await hass.async_block_till_done()
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.5})
    hass.states.async_set("binary_sensor.vordis_card", "off")
    await hass.async_block_till_done()
    assert len(calls["pause"]) == 1


async def test_websocket(hass, reader, calls, hass_ws_client):
    entry = await _setup(hass, reader)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "vordisarvarpid/get"})
    res = (await ws.receive_json())["result"]
    assert [c["name"] for c in res["cards"]] == ["Vordís Partí", "Lína langsokkur"] and all(c["id"] for c in res["cards"])
    cards = res["cards"]
    await ws.send_json({"id": 2, "type": "vordisarvarpid/subscribe"})
    assert (await ws.receive_json())["success"]
    cards.append({"name": "Nýtt", "tag_id": "CC", "media_id": "library://album/2", "media_type": "album"})
    await ws.send_json({"id": 3, "type": "vordisarvarpid/save_cards", "cards": cards})
    msg = await ws.receive_json()
    if msg.get("type") == "event":
        msg = await ws.receive_json()
    assert len(msg["result"]["cards"]) == 3
    first = cards[0]["id"]
    await ws.send_json({"id": 4, "type": "vordisarvarpid/update", "labels": {first: {"title": "Partí!", "copies": 2}},
                        "settings": {"style": "pop"}, "names": {"spotify://x": {"name": "Bók"}}})
    while (m := await ws.receive_json()).get("id") != 4 or m.get("type") == "event":
        pass
    assert entry.runtime_data.store.data["labels"][first] == {"title": "Partí!", "copies": 2}
    assert entry.runtime_data.store.data["settings"]["style"] == "pop"
    await ws.send_json({"id": 5, "type": "vordisarvarpid/play", "card": cards[2]})
    while (m := await ws.receive_json()).get("id") != 5 or m.get("type") == "event":
        pass
    assert m["success"] and calls["ma_play"][-1].data["media_id"] == "library://album/2"


async def test_import_from_blueprint(hass, reader, calls):
    auto = [{
        "id": "1792006447703", "alias": "Miðlar - Vordísarvarpið: NFC spilari",
        "use_blueprint": {"path": "tonaval/tonaval_nfc_spilari.yaml", "input": {
            "reader_device": reader.id, "player": PLAYER, "button_event": "event.vordis_button",
            "card_present": "binary_sensor.vordis_card", "cards": CARDS, "max_volume": 0.6,
            "max_volume_entity": "input_number.max", "memory_helper": "input_text.last", "volume_step": 0.04,
            "on_known_card": [{"action": "esphome.nfc_reader_play_sound", "data": {"sound": "success"}}],
        }},
    }]
    await hass.async_add_executor_job(lambda: open(hass.config.path("automations.yaml"), "w").write(yaml.safe_dump(auto, allow_unicode=True)))
    er.async_get(hass).async_get_or_create("automation", "automation", "1792006447703", suggested_object_id="tonaval")
    hass.states.async_set("input_number.max", "0.45")
    hass.states.async_set("input_text.last", "aa-bb")
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5})

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.MENU
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"next_step_id": "import_blueprint"})
    assert result["type"] is FlowResultType.FORM and result["description_placeholders"]["cards"] == "2"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"disable_automation": True})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.state is ConfigEntryState.LOADED and "import" not in entry.data
    assert entry.data["sound_service"] == "esphome.nfc_reader_play_sound"
    data = entry.runtime_data.store.data
    assert len(data["cards"]) == 2 and data["max_volume"] == 0.45 and data["last_tag"] == "AA-BB"
    assert calls["auto_off"][-1].data["entity_id"] == "automation.tonaval"
    # the moved cards work straight away
    await _scan(hass, reader, "89-4A-71-E6")
    assert calls["ma_play"][-1].data["media_id"] == "library://playlist/14"


async def test_manual_flow_and_options(hass, reader, calls):
    import os
    path = hass.config.path("automations.yaml")
    await hass.async_add_executor_job(lambda: os.path.exists(path) and os.remove(path))
    hass.states.async_set(PLAYER, "idle")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "manual"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {
        "reader_device": reader.id, "player": PLAYER, "start_volume": 0, "volume_step": 0.04,
        "pause_on_remove": True, "resume_same_card": True,
    })
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "player": "media_player.other", "start_volume": 0.2, "volume_step": 0.05,
        "pause_on_remove": False, "resume_same_card": True,
    })
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.runtime_data.box.player == "media_player.other"


async def test_play_card_action(hass, reader, calls):
    await _setup(hass, reader)
    await hass.services.async_call(DOMAIN, "play_card", {"card": "lína langsokkur"}, blocking=True)
    assert calls["ma_play"][-1].data["media_type"] == "audiobook"


async def test_card_page_is_served(hass, reader, calls, hass_client):
    await _setup(hass, reader)
    client = await hass_client()
    resp = await client.get("/vordisarvarpid_static/vordisarvarpid-kortamidar-card.js")
    assert resp.status == 200 and "vordisarvarpid-kortamidar-card" in await resp.text()
