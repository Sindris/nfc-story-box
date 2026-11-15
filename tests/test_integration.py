"""Tests for NFC Story Box, run against a real Home Assistant core."""

from __future__ import annotations

import asyncio

import pytest
import yaml

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component

from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.nfc_story_box.const import DOMAIN, EVENT_CARD_SCANNED

PLAYER = "media_player.vordis"
CARDS = [
    {"name": "Party Playlist", "tag_id": "89-4A-71-E6", "media_id": "library://playlist/14", "media_type": "playlist", "shuffle": False},
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
        "seek": async_mock_service(hass, "media_player", "media_seek"),
        "auto_off": async_mock_service(hass, "automation", "turn_off"),
    }


async def _setup(hass: HomeAssistant, reader, **opts) -> MockConfigEntry:
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5})
    entry = MockConfigEntry(
        domain=DOMAIN, title="NFC Story Box", unique_id=reader.id,
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
    assert seen[-1]["known"] is True and seen[-1]["name"] == "Party Playlist"
    assert hass.states.get("sensor.nfc_story_box_card_playing").state == "Party Playlist"
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
    await hass.services.async_call("number", "set_value", {"entity_id": "number.nfc_story_box_max_volume", "value": 0.55}, blocking=True)
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:02", {"event_type": "volume_up"})
    await hass.async_block_till_done()
    assert calls["volume"][-1].data["volume_level"] == 0.55
    assert entry.runtime_data.store.data["max_volume"] == 0.55
    hass.states.async_set("event.vordis_button", "2026-01-01T00:00:03", {"event_type": "next"})
    await hass.async_block_till_done()
    assert len(calls["next"]) == 1


async def test_lifting_card_pauses(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set("binary_sensor.vordis_card", "on")
    await hass.async_block_till_done()
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.5})
    hass.states.async_set("binary_sensor.vordis_card", "off")
    await hass.async_block_till_done()
    assert len(calls["pause"]) == 1


async def _lift(hass):
    hass.states.async_set("binary_sensor.vordis_card", "on")
    await hass.async_block_till_done()
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.5})
    hass.states.async_set("binary_sensor.vordis_card", "off")
    await hass.async_block_till_done()


async def test_pause_on_remove_switch(hass, reader, calls):
    entry = await _setup(hass, reader)
    sw = "switch.nfc_story_box_pause_when_the_card_is_lifted"
    assert hass.states.get(sw).state == "on"  # on by default
    box = entry.runtime_data.box

    await _scan(hass, reader, "89-4A-71-E6")
    await hass.services.async_call("switch", "turn_off", {"entity_id": sw}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get(sw).state == "off"
    assert entry.options["pause_on_remove"] is False
    assert entry.runtime_data.box is box  # flipped live, no reload
    await _lift(hass)
    assert not calls["pause"]  # keeps playing

    await hass.services.async_call("switch", "turn_on", {"entity_id": sw}, blocking=True)
    await hass.async_block_till_done()
    await _lift(hass)
    assert len(calls["pause"]) == 1 and entry.runtime_data.box is box


async def test_keep_playing_per_card(hass, reader, calls):
    entry = await _setup(hass, reader)
    store = entry.runtime_data.store
    cards = [dict(c) for c in store.cards]
    cards[0]["keep_playing"] = True  # Party Playlist keeps playing; Lína langsokkur pauses
    store.set_cards(cards)
    assert store.card_for_tag("89-4A-71-E6")["keep_playing"] is True
    assert store.card_for_tag("AA-BB")["keep_playing"] is False  # default

    await _scan(hass, reader, "89-4A-71-E6")
    await _lift(hass)
    assert not calls["pause"]

    await _scan(hass, reader, "AA-BB")
    await _lift(hass)
    assert len(calls["pause"]) == 1


async def test_websocket(hass, reader, calls, hass_ws_client):
    entry = await _setup(hass, reader)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "nfc_story_box/get"})
    res = (await ws.receive_json())["result"]
    assert [c["name"] for c in res["cards"]] == ["Party Playlist", "Lína langsokkur"] and all(c["id"] for c in res["cards"])
    cards = res["cards"]
    await ws.send_json({"id": 2, "type": "nfc_story_box/subscribe"})
    assert (await ws.receive_json())["success"]
    cards.append({"name": "Nýtt", "tag_id": "CC", "media_id": "library://album/2", "media_type": "album"})
    await ws.send_json({"id": 3, "type": "nfc_story_box/save_cards", "cards": cards})
    msg = await ws.receive_json()
    if msg.get("type") == "event":
        msg = await ws.receive_json()
    assert len(msg["result"]["cards"]) == 3
    first = cards[0]["id"]
    await ws.send_json({"id": 4, "type": "nfc_story_box/update", "labels": {first: {"title": "Partí!", "copies": 2}},
                        "settings": {"style": "pop"}, "names": {"spotify://x": {"name": "Bók"}}})
    while (m := await ws.receive_json()).get("id") != 4 or m.get("type") == "event":
        pass
    assert entry.runtime_data.store.data["labels"][first] == {"title": "Partí!", "copies": 2}
    assert entry.runtime_data.store.data["settings"]["style"] == "pop"
    await ws.send_json({"id": 5, "type": "nfc_story_box/play", "card": cards[2]})
    while (m := await ws.receive_json()).get("id") != 5 or m.get("type") == "event":
        pass
    assert m["success"] and calls["ma_play"][-1].data["media_id"] == "library://album/2"


async def test_migrate_from_the_pre_release_version(hass, reader, calls):
    from homeassistant.helpers.storage import Store

    old = MockConfigEntry(
        domain="vordisarvarpid", title="Old box", unique_id=reader.id,
        data={"reader_device": reader.id, "player": PLAYER, "button_event": "event.vordis_button",
              "card_present": "binary_sensor.vordis_card", "sound_service": "esphome.nfc_reader_play_sound"},
        options={"daily_limit": 45},
    )
    old.add_to_hass(hass)
    await Store(hass, 1, f"vordisarvarpid.{old.entry_id}").async_save(
        {"cards": CARDS, "max_volume": 0.45, "last_tag": "AA-BB", "history": {}}
    )
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5})

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.MENU
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"next_step_id": "migrate"})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "migrate"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"migrate_from": old.entry_id, "name": "My box", "disable_legacy": True}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY and result["title"] == "My box"
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.state is ConfigEntryState.LOADED
    assert entry.data["migrated"] and entry.data["sound_service"] == "esphome.nfc_reader_play_sound"
    data = entry.runtime_data.store.data
    assert len(data["cards"]) == 2 and data["max_volume"] == 0.45 and data["last_tag"] == "AA-BB"
    assert entry.options.get("daily_limit") == 45 or entry.data.get("daily_limit") == 45
    assert old.disabled_by is not None
    # the moved cards work straight away
    await _scan(hass, reader, "89-4A-71-E6")
    assert calls["ma_play"][-1].data["media_id"] == "library://playlist/14"
    # once moved, the earlier setup is no longer offered
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "manual"


async def test_manual_flow_and_options(hass, reader, calls):
    import os
    path = hass.config.path("automations.yaml")
    await hass.async_add_executor_job(lambda: os.path.exists(path) and os.remove(path))
    hass.states.async_set(PLAYER, "idle")
    async_mock_service(hass, "notify", "phone_a")
    async_mock_service(hass, "notify", "phone_b")
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
    assert result["type"] is FlowResultType.FORM
    assert set(result["data_schema"].schema) and {str(k) for k in result["data_schema"].schema} == {"speaker", "playback", "limits", "stats"}
    # a half-set quiet period is refused, and what was typed stays
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "speaker": {"player": "media_player.other"},
        "playback": {"start_volume": 0.2, "volume_step": 0.05, "pause_on_remove": False, "resume_same_card": True},
        "limits": {"quiet_start": "21:00:00", "quiet_max_volume": 0, "quiet_stories_only": False, "daily_limit": 0},
        "stats": {"record_stats": True},
    })
    assert result["type"] is FlowResultType.FORM and result["errors"] == {"base": "quiet_incomplete"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "speaker": {"player": "media_player.other", "only_speaker": True},
        "playback": {"start_volume": 0.2, "volume_step": 0.05, "pause_on_remove": False, "resume_same_card": True},
        "limits": {"quiet_start": "21:00:00", "quiet_end": "07:00:00", "quiet_max_volume": 0.3, "quiet_stories_only": False, "daily_limit": 0},
        "stats": {"record_stats": True, "summary_notify": ["notify.nowhere"]},
    })
    assert result["type"] is FlowResultType.FORM and result["errors"] == {"base": "unknown_notify"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {
        "speaker": {"player": "media_player.other", "only_speaker": True},
        "playback": {"start_volume": 0.2, "volume_step": 0.05, "pause_on_remove": False, "resume_same_card": True},
        "limits": {"quiet_start": "21:00:00", "quiet_end": "07:00:00", "quiet_max_volume": 0.3, "quiet_stories_only": False, "daily_limit": 0},
        "stats": {"record_stats": True, "summary_notify": ["notify.phone_a", "notify.phone_b"]},
    })
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options["summary_notify"] == ["notify.phone_a", "notify.phone_b"]
    assert entry.options["player"] == "media_player.other" and entry.options["only_speaker"] is True
    assert entry.options["quiet_end"] == "07:00:00"
    assert entry.runtime_data.box.player == "media_player.other"


async def test_play_card_action(hass, reader, calls):
    await _setup(hass, reader)
    await hass.services.async_call(DOMAIN, "play_card", {"card": "lína langsokkur"}, blocking=True)
    assert calls["ma_play"][-1].data["media_type"] == "audiobook"


async def test_card_page_is_served(hass, reader, calls, hass_client):
    await _setup(hass, reader)
    client = await hass_client()
    resp = await client.get("/nfc_story_box_static/nfc-story-box-card.js")
    assert resp.status == 200 and "nfc-story-box-card" in await resp.text()


# ---- 1.1: fixes and new features

SERIES = ["library://audiobook/62", "library://audiobook/67", "library://audiobook/27"]


@pytest.fixture(autouse=True)
def no_seek_wait(monkeypatch):
    monkeypatch.setattr("custom_components.nfc_story_box.controller.SEEK_WAIT", 0)


def _set_cards(entry, **changes):
    """Change fields on the cards by name, e.g. _set_cards(entry, **{"Lína langsokkur": {"next_each_time": True}})."""
    store = entry.runtime_data.store
    cards = [dict(c) for c in store.cards]
    for card in cards:
        card.update(changes.get(card["name"], {}))
    cards += changes.get("add", [])
    store.set_cards(cards)
    return store


async def test_same_card_while_playing_is_left_alone(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.5})
    await _scan(hass, reader, "89-4A-71-E6")  # e.g. the box restarted with the card on it
    assert len(calls["ma_play"]) == 1 and not calls["play"]


async def test_lifting_does_not_pause_what_the_box_did_not_start(hass, reader, calls):
    await _setup(hass, reader)
    await _lift(hass)  # someone else is playing on the speaker
    assert not calls["pause"]
    await _scan(hass, reader, "89-4A-71-E6")
    await _lift(hass)
    assert len(calls["pause"]) == 1
    assert calls["sound"][-1].data["sound"] == "removed"


async def test_max_volume_is_held(hass, reader, calls):
    entry = await _setup(hass, reader)
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.9})
    await hass.async_block_till_done()
    assert not calls["volume"]  # not ours
    await _scan(hass, reader, "89-4A-71-E6")
    calls["volume"].clear()
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.95})
    await hass.async_block_till_done()
    assert calls["volume"][-1].data["volume_level"] == entry.runtime_data.box.max_volume == 0.6


async def test_story_continues_where_it_stopped(hass, reader, calls):
    entry = await _setup(hass, reader)
    await _scan(hass, reader, "AA-BB")
    assert calls["ma_play"][-1].data["media_id"] == SERIES
    # second book, two minutes in, then paused
    hass.states.async_set(PLAYER, "playing", {"media_content_id": SERIES[1], "media_position": 120})
    await hass.async_block_till_done()
    hass.states.async_set(PLAYER, "paused", {"media_content_id": SERIES[1], "media_position": 120})
    await hass.async_block_till_done()
    pos = entry.runtime_data.store.data["positions"]
    assert list(pos.values())[0]["index"] == 1 and list(pos.values())[0]["elapsed"] == 120

    await _scan(hass, reader, "89-4A-71-E6")  # another card in between
    hass.states.async_set(PLAYER, "idle")
    await _scan(hass, reader, "AA-BB")
    assert calls["ma_play"][-1].data["media_id"] == SERIES[1:]
    assert calls["seek"][-1].data["seek_position"] == 115
    assert entry.runtime_data.store.data["history"][entry.runtime_data.store.card_for_tag("AA-BB")["id"]]["count"] == 2


async def test_music_starts_from_the_top(hass, reader, calls):
    await _setup(hass, reader)
    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set(PLAYER, "paused", {"media_position": 300})
    await _scan(hass, reader, "AA-BB")
    hass.states.async_set(PLAYER, "idle")
    await _scan(hass, reader, "89-4A-71-E6")
    assert calls["ma_play"][-1].data["media_id"] == "library://playlist/14" and not calls["seek"]


async def test_next_book_each_time(hass, reader, calls):
    entry = await _setup(hass, reader)
    _set_cards(entry, **{"Lína langsokkur": {"next_each_time": True}})
    for expected in (SERIES, SERIES[1:], SERIES[2], SERIES):
        hass.states.async_set(PLAYER, "idle")
        await _scan(hass, reader, "AA-BB")
        assert calls["ma_play"][-1].data["media_id"] == expected


async def test_card_with_its_own_speaker_and_volume(hass, reader, calls):
    entry = await _setup(hass, reader)
    hass.states.async_set("media_player.bedroom", "idle", {"volume_level": 0.5})
    _set_cards(entry, **{"Lína langsokkur": {"player": "media_player.bedroom", "start_volume": 0.2}})
    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.3})
    await _scan(hass, reader, "AA-BB")
    assert calls["ma_play"][-1].data["entity_id"] == "media_player.bedroom"
    assert calls["volume"][-1].data == {"entity_id": "media_player.bedroom", "volume_level": 0.2}
    assert calls["pause"][-1].data["entity_id"] == PLAYER  # the first speaker stops
    assert entry.runtime_data.box.player == "media_player.bedroom"


async def test_control_cards(hass, reader, calls):
    entry = await _setup(hass, reader)
    hass.states.async_set("media_player.bedroom", "idle")
    _set_cards(entry, add=[
        {"name": "Stopp", "tag_id": "C-1", "action": "stop"},
        {"name": "Sofa", "tag_id": "C-2", "action": "sleep", "minutes": 20},
        {"name": "Óvænt", "tag_id": "C-3", "action": "surprise"},
        {"name": "Herbergið mitt", "tag_id": "C-4", "action": "speaker", "player": "media_player.bedroom"},
    ])
    box = entry.runtime_data.box
    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.5})
    await _scan(hass, reader, "C-1")
    assert len(calls["pause"]) == 1 and len(calls["ma_play"]) == 1

    await _scan(hass, reader, "C-2")
    assert box.sleep_until is not None
    await hass.services.async_call(DOMAIN, "sleep_timer", {"minutes": 0}, blocking=True)
    assert box.sleep_until is None

    hass.states.async_set(PLAYER, "idle")
    await _scan(hass, reader, "C-3")
    assert len(calls["ma_play"]) == 2

    await _scan(hass, reader, "C-4")
    assert box.default_player == "media_player.bedroom"
    await hass.services.async_call(DOMAIN, "set_speaker", {}, blocking=True)
    assert box.default_player == PLAYER


async def test_quiet_hours(hass, reader, calls):
    from datetime import timedelta
    from homeassistant.util import dt as dt_util

    now = dt_util.now()
    entry = await _setup(
        hass, reader,
        quiet_start=(now - timedelta(hours=1)).strftime("%H:%M:%S"), quiet_end=(now + timedelta(hours=1)).strftime("%H:%M:%S"),
        quiet_max_volume=0.25, quiet_stories_only=True,
    )
    box = entry.runtime_data.box
    assert box.quiet and box.max_volume == 0.25 and box.base_max_volume == 0.6
    await _scan(hass, reader, "89-4A-71-E6")  # music: not now
    assert not calls["ma_play"] and calls["sound"][-1].data["sound"] == "unknown"
    assert box.last_scan["blocked"] == "quiet"
    await _scan(hass, reader, "AA-BB")  # a story is fine, at the quiet volume
    assert len(calls["ma_play"]) == 1
    assert calls["volume"][-1].data["volume_level"] == 0.25


async def test_daily_limit(hass, reader, calls):
    entry = await _setup(hass, reader, daily_limit=30)
    box = entry.runtime_data.box
    await _scan(hass, reader, "89-4A-71-E6")
    assert len(calls["ma_play"]) == 1
    box._usage()["seconds"] = 31 * 60
    assert box.limit_reached
    assert hass.states.get("sensor.nfc_story_box_listened_today").attributes["limit"] == 30
    hass.states.async_set(PLAYER, "idle")
    await _scan(hass, reader, "AA-BB")
    assert len(calls["ma_play"]) == 1 and box.last_scan["blocked"] == "limit"
    # while playing, the next tick pauses
    hass.states.async_set(PLAYER, "idle")
    box._usage()["seconds"] = 0
    await _scan(hass, reader, "AA-BB")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.3})
    await hass.async_block_till_done()
    box._usage()["seconds"] = 31 * 60
    await box._on_tick(None)
    assert len(calls["pause"]) == 1


async def test_repair_notice_for_missing_speaker(hass, reader, calls):
    from homeassistant.helpers import issue_registry as ir

    entry = await _setup(hass, reader)
    issues = ir.async_get(hass)
    hass.states.async_set(PLAYER, "unavailable")
    await _scan(hass, reader, "89-4A-71-E6")
    assert issues.async_get_issue(DOMAIN, f"speaker_{entry.entry_id}")
    hass.states.async_set(PLAYER, "idle")
    await _scan(hass, reader, "89-4A-71-E6")
    assert issues.async_get_issue(DOMAIN, f"speaker_{entry.entry_id}") is None


async def test_diagnostics(hass, reader, calls):
    from custom_components.nfc_story_box.diagnostics import async_get_config_entry_diagnostics

    entry = await _setup(hass, reader)
    diag = await async_get_config_entry_diagnostics(hass, entry)
    assert len(diag["cards"]) == 2 and diag["cards"][1]["items"] == 3
    assert "tag_id" not in str(diag["cards"]) and "Lína" not in str(diag)


async def test_speaker_in_a_group_that_is_on(hass, reader, calls):
    """Music Assistant plays on the whole group then; the box follows the group, so lifting still pauses."""
    entry = await _setup(hass, reader)
    group = "media_player.everyone"
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5, "active_queue": "g1", "group_members": []})
    hass.states.async_set(group, "idle", {"volume_level": 0.5, "active_queue": "g1", "group_members": [PLAYER, "media_player.x"]})
    await _scan(hass, reader, "89-4A-71-E6")
    assert calls["ma_play"][-1].data["entity_id"] == group
    hass.states.async_set("binary_sensor.vordis_card", "on")
    hass.states.async_set(group, "playing", {"volume_level": 0.5, "active_queue": "g1", "group_members": [PLAYER, "media_player.x"]})
    await hass.async_block_till_done()
    hass.states.async_set("binary_sensor.vordis_card", "off")
    await hass.async_block_till_done()
    assert calls["pause"][-1].data["entity_id"] == group
    # the group is switched off again: back to the speaker itself
    hass.states.async_set(group, "off", {"active_queue": "g1", "group_members": [PLAYER, "media_player.x"]})
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5, "active_queue": "own"})
    await _scan(hass, reader, "AA-BB")
    assert calls["ma_play"][-1].data["entity_id"] == PLAYER


async def test_only_speaker_switches_the_group_off(hass, reader, calls):
    """With "only this speaker" on, the group the speaker is in is switched off and the speaker itself plays."""
    off = async_mock_service(hass, "media_player", "turn_off")
    entry = await _setup(hass, reader, only_speaker=True)
    group = "media_player.everyone"
    hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5, "active_queue": "g1", "group_members": []})
    hass.states.async_set(group, "idle", {"volume_level": 0.5, "active_queue": "g1", "group_members": [PLAYER, "media_player.x"]})

    async def _group_goes_off():
        await asyncio.sleep(0.1)
        hass.states.async_set(group, "off", {"active_queue": "g1", "group_members": [PLAYER, "media_player.x"]})
        await asyncio.sleep(0.5)  # Music Assistant gives the speaker its own queue a moment later
        order.append("own queue")
        hass.states.async_set(PLAYER, "idle", {"volume_level": 0.5, "active_queue": "own", "group_members": []})

    order = []
    task = hass.async_create_task(_group_goes_off())
    await _scan(hass, reader, "89-4A-71-E6")
    await task
    assert off and off[-1].data["entity_id"] == group
    assert order == ["own queue"]  # played only after the speaker was free of the group
    assert calls["ma_play"][-1].data["entity_id"] == PLAYER


# ---- statistics
async def _listen(hass, reader, box, seconds=120):
    import time

    await _scan(hass, reader, "89-4A-71-E6")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.3})
    await hass.async_block_till_done()
    box._playing_since = time.monotonic() - seconds
    box._account()


async def test_statistics_are_recorded(hass, reader, calls):
    from homeassistant.util import dt as dt_util

    entry = await _setup(hass, reader)
    box = entry.runtime_data.box
    await _listen(hass, reader, box, 120)
    stats = entry.runtime_data.store.data["stats"]
    today = dt_util.now().date().isoformat()
    card_id = entry.runtime_data.store.cards[0]["id"]
    day = stats["days"][today]
    assert 119 <= day["s"] <= 125 and day["m"] == day["s"] and day["t"] == 0 and day["n"] == 1
    assert 119 <= day["c"][card_id] <= 125 and PLAYER in day["p"]
    assert stats["plays"][-1]["name"] == "Party Playlist" and 119 <= stats["plays"][-1]["sec"] <= 125
    assert stats["names"][card_id] == "Party Playlist"
    assert hass.states.get("sensor.nfc_story_box_listened_this_week") is not None


async def test_story_time_counts_as_stories(hass, reader, calls):
    import time

    entry = await _setup(hass, reader)
    box = entry.runtime_data.box
    await _scan(hass, reader, "AA-BB")
    hass.states.async_set(PLAYER, "playing", {"volume_level": 0.3})
    await hass.async_block_till_done()
    box._playing_since = time.monotonic() - 60
    box._account()
    day = next(iter(entry.runtime_data.store.data["stats"]["days"].values()))
    assert day["t"] >= 59 and day["m"] == 0


async def test_statistics_can_be_switched_off(hass, reader, calls):
    entry = await _setup(hass, reader, record_stats=False)
    await _listen(hass, reader, entry.runtime_data.box, 90)
    stats = entry.runtime_data.store.data["stats"]
    assert stats["days"] == {} and stats["plays"] == []


def test_summary_numbers():
    from datetime import date

    from custom_components.nfc_story_box import stats as statlib

    data = {"cards": [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}, {"id": "c", "name": "C"}], "history": {"a": {"count": 3}}, "positions": {}}
    today = date(2026, 11, 15)  # a Sunday
    for day, hour, sec, cid in (("2026-11-15", 19, 600, "a"), ("2026-11-14", 8, 300, "b"), ("2026-11-05", 20, 900, "a")):
        statlib.record_time(data, day=day, hour=hour, seconds=sec, card={"id": cid, "name": cid.upper()}, player="media_player.x", story=cid == "b", now_iso="2026-11-15T10:00:00")
    entry = statlib.record_start(data, day="2026-11-15", card={"id": "b", "name": "B"}, player="media_player.x", now_iso="2026-11-15T10:00:00")
    assert entry["sec"] == 0
    out = statlib.summary(data, today, 30)
    assert out["today"] == 600 and out["week"] == 900 and out["prev_week"] == 900  # 11-05 falls in the week before last... within 8-14
    assert out["total"] == 1800 and out["listening_days"] == 3 and out["starts"] == 1
    assert [c["id"] for c in out["cards"]] == ["a", "b"] and out["cards"][0]["sec"] == 1500
    assert out["heat"][6][19] == 600  # Sunday 19:00
    assert out["stories"] == 300 and out["music"] == 1500
    assert out["cards"][1]["short"] == 1  # B was started and lifted straight away
    assert {u["id"] for u in out["unplayed"]} == {"a", "b", "c"}
    assert out["players"][0]["sec"] == 1800
    # old days are dropped
    statlib.record_time(data, day="2026-01-01", hour=1, seconds=5, card=None, player=None, story=False, now_iso="x")
    for i in range(100):
        statlib.record_time(data, day=f"2026-02-{i:03d}", hour=1, seconds=5, card=None, player=None, story=False, now_iso="x")
    assert len(data["stats"]["days"]) == 90


async def test_statistics_websocket(hass, reader, calls, hass_ws_client):
    entry = await _setup(hass, reader)
    await _listen(hass, reader, entry.runtime_data.box, 150)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "nfc_story_box/stats", "span": 7})
    res = (await client.receive_json())["result"]
    assert res["span"] == 7 and len(res["series"]) == 7 and res["recording"] is True
    assert res["cards"][0]["name"] == "Party Playlist" and res["today"] >= 149
    await client.send_json({"id": 2, "type": "nfc_story_box/reset_stats"})
    assert (await client.receive_json())["success"]
    await client.send_json({"id": 3, "type": "nfc_story_box/stats"})
    res = (await client.receive_json())["result"]
    assert res["total"] == 0 and res["cards"] == []


async def test_weekly_summary(hass, reader, calls):
    entry = await _setup(hass, reader, summary_notify="notify.phone")
    notes = async_mock_service(hass, "notify", "phone")
    events = []
    hass.bus.async_listen("nfc_story_box_weekly_summary", lambda e: events.append(e.data))
    await _listen(hass, reader, entry.runtime_data.box, 600)
    await hass.services.async_call(DOMAIN, "weekly_summary", {}, blocking=True)
    await hass.async_block_till_done()
    assert events and events[-1]["favourite"] == "Party Playlist" and events[-1]["minutes"] >= 9
    assert notes and "Party Playlist" in notes[-1].data["message"]


async def test_weekly_summary_to_several_devices(hass, reader, calls):
    entry = await _setup(hass, reader, summary_notify=["notify.phone", "notify.tablet"])
    phone = async_mock_service(hass, "notify", "phone")
    tablet = async_mock_service(hass, "notify", "tablet")
    await _listen(hass, reader, entry.runtime_data.box, 600)
    await hass.services.async_call(DOMAIN, "weekly_summary", {}, blocking=True)
    await hass.async_block_till_done()
    assert phone and tablet


@pytest.mark.parametrize(
    ("language", "expected"),
    [("is", "Tækið spilaði"), ("sv", "Lådan spelade"), ("en", "This week the box played")],
)
async def test_weekly_summary_language(hass, reader, calls, language, expected):
    hass.config.language = language
    entry = await _setup(hass, reader, summary_notify=["notify.phone"])
    phone = async_mock_service(hass, "notify", "phone")
    await _listen(hass, reader, entry.runtime_data.box, 600)
    await hass.services.async_call(DOMAIN, "weekly_summary", {}, blocking=True)
    await hass.async_block_till_done()
    assert expected in phone[0].data["message"]


async def test_phone_scan_is_optional(hass, reader, calls):
    await _setup(hass, reader)
    hass.bus.async_fire("tag_scanned", {"tag_id": "89-4a-71-e6", "device_id": "phone"})
    await hass.async_block_till_done()
    assert not calls["ma_play"]


async def test_phone_scan_plays_when_enabled(hass, reader, calls):
    await _setup(hass, reader, phone_scan=True)
    hass.bus.async_fire("tag_scanned", {"tag_id": "89-4a-71-e6", "device_id": "phone"})
    await hass.async_block_till_done()
    assert calls["ma_play"]
