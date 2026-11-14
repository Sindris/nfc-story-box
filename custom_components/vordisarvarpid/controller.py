"""The box itself: reacts to cards, buttons and lifting a card, and plays through Music Assistant.

Does what the 'Tónaval – NFC spilari' blueprint did, so that blueprint is no longer needed.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_PAUSED, STATE_PLAYING, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import dt as dt_util

from .const import (
    BTN_NEXT,
    BTN_PLAY_PAUSE,
    BTN_PREVIOUS,
    BTN_VOLUME_DOWN,
    BTN_VOLUME_UP,
    CONF_BUTTON_EVENT,
    CONF_CARD_PRESENT,
    CONF_PAUSE_ON_REMOVE,
    CONF_PLAYER,
    CONF_READER_DEVICE,
    CONF_RESUME_SAME_CARD,
    CONF_SOUND_SERVICE,
    CONF_START_VOLUME,
    CONF_VOLUME_STEP,
    DEFAULT_START_VOLUME,
    DEFAULT_VOLUME_STEP,
    EVENT_CARD_SCANNED,
    MIN_VOLUME,
    SIGNAL_UPDATED,
)
from .store import VordisStore, norm_tag

_LOGGER = logging.getLogger(__name__)


def play_items(card: dict[str, Any]) -> list[str]:
    """The media a card plays, in order: its main media, then the rest of a series."""
    first = str(card.get("media_id") or "").strip()
    if not first and isinstance(card.get("media"), dict):
        first = str(card["media"].get("media_content_id") or "").strip()
    more = [x.strip() for x in str(card.get("more_media") or "").split("\n") if x.strip()]
    return ([first] if first else []) + more


class VordisBox:
    """One Vordísarvarpið box: an NFC reader, its buttons and a speaker."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: VordisStore) -> None:
        self.hass = hass
        self.entry = entry
        self.store = store
        self._unsubs: list[CALLBACK_TYPE] = []
        self._lock = asyncio.Lock()
        self.current: dict[str, Any] | None = None
        self.last_scan: dict[str, Any] | None = None

    # ---- configuration
    @property
    def conf(self) -> dict[str, Any]:
        return {**self.entry.data, **self.entry.options}

    @property
    def player(self) -> str:
        return self.conf[CONF_PLAYER]

    @property
    def max_volume(self) -> float:
        return float(self.store.data.get("max_volume") or 0.6)

    async def async_set_max_volume(self, value: float) -> None:
        self.store.data["max_volume"] = round(max(MIN_VOLUME, min(1.0, float(value))), 2)
        self.store.schedule_save()
        self._updated()

    # ---- listeners
    @callback
    def async_start(self) -> None:
        conf = self.conf
        self._unsubs.append(self.hass.bus.async_listen("tag_scanned", self._on_tag))
        if conf.get(CONF_BUTTON_EVENT):
            self._unsubs.append(
                async_track_state_change_event(self.hass, [conf[CONF_BUTTON_EVENT]], self._on_button)
            )
        if conf.get(CONF_CARD_PRESENT):
            self._unsubs.append(
                async_track_state_change_event(self.hass, [conf[CONF_CARD_PRESENT]], self._on_presence)
            )
        last = self.store.card_for_tag(self.store.data.get("last_tag") or "")
        if last:
            self.current = {"card_id": last["id"], "name": last["name"], "tag_id": last.get("tag_id")}

    @callback
    def async_stop(self) -> None:
        while self._unsubs:
            self._unsubs.pop()()

    @callback
    def _updated(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_UPDATED.format(self.entry.entry_id))

    # ---- triggers
    @callback
    def _on_tag(self, event: Event) -> None:
        reader = self.conf.get(CONF_READER_DEVICE)
        if reader and event.data.get("device_id") != reader:
            return
        tag = norm_tag(event.data.get("tag_id"))
        if not tag:
            return
        card = self.store.card_for_tag(tag)
        self.last_scan = {
            "tag_id": event.data.get("tag_id"),
            "card_id": card["id"] if card else None,
            "name": card["name"] if card else None,
            "known": card is not None,
            "time": dt_util.utcnow().isoformat(),
        }
        self.hass.bus.async_fire(EVENT_CARD_SCANNED, {"entry_id": self.entry.entry_id, **self.last_scan})
        self._updated()
        self.hass.async_create_task(self._handle_scan(tag, card))

    async def _handle_scan(self, tag: str, card: dict[str, Any] | None) -> None:
        if card is None:
            await self._sound("unknown")
            return
        await self._sound("success")
        await self.async_play_card(card, from_scan=True)

    @callback
    def _on_button(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None or new.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            return
        if old is None or old.state == STATE_UNAVAILABLE:
            return  # the box just (re)connected; not a press
        kind = new.attributes.get("event_type")
        self.hass.async_create_task(self.async_button(kind))

    @callback
    def _on_presence(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if not self.conf.get(CONF_PAUSE_ON_REMOVE, True):
            return
        if old is None or new is None or old.state != "on" or new.state != "off":
            return
        self.hass.async_create_task(self._pause_if_playing())

    # ---- actions
    async def _call(self, domain: str, service: str, data: dict[str, Any], *, quiet: bool = False) -> None:
        try:
            await self.hass.services.async_call(domain, service, data, blocking=True)
        except Exception as err:  # noqa: BLE001 - the box keeps going, like continue_on_error
            if not quiet:
                raise
            _LOGGER.debug("%s.%s failed: %s", domain, service, err)

    async def _sound(self, sound: str) -> None:
        target = str(self.conf.get(CONF_SOUND_SERVICE) or "").strip()
        if "." not in target:
            return
        domain, service = target.split(".", 1)
        if not self.hass.services.has_service(domain, service):
            return
        await self._call(domain, service, {"sound": sound}, quiet=True)

    async def async_play_card(self, card: dict[str, Any], *, from_scan: bool = False) -> None:
        """Play a card, or continue it if it is the same card and playback is paused."""
        async with self._lock:
            player = self.player
            tag = norm_tag(card.get("tag_id"))
            state = self.hass.states.get(player)
            if state is None or state.state == STATE_UNAVAILABLE:
                # Nothing can play there; don't let this count as the "last card".
                _LOGGER.warning(
                    "Speaker %s is %s; cards need a Music Assistant player (check the integration's settings)",
                    player, state.state if state else "missing",
                )
                return
            if (
                from_scan
                and self.conf.get(CONF_RESUME_SAME_CARD, True)
                and tag
                and self.store.data.get("last_tag") == tag
                and self.store.data.get("last_player") == player
                and state is not None
                and state.state == STATE_PAUSED
            ):
                await self._call("media_player", "media_play", {"entity_id": player})
            else:
                start = float(self.conf.get(CONF_START_VOLUME, DEFAULT_START_VOLUME) or 0)
                if start > 0:
                    await self._call(
                        "media_player", "volume_set",
                        {"entity_id": player, "volume_level": min(start, self.max_volume)}, quiet=True,
                    )
                await self._call(
                    "media_player", "shuffle_set", {"entity_id": player, "shuffle": bool(card.get("shuffle"))}, quiet=True
                )
                await self._call("media_player", "repeat_set", {"entity_id": player, "repeat": "off"}, quiet=True)
                items = play_items(card)
                media = card.get("media")
                if isinstance(media, dict) and media.get("media_content_id") and not card.get("media_id") and len(items) == 1:
                    await self._call("media_player", "play_media", {
                        "entity_id": player,
                        "media_content_id": media["media_content_id"],
                        "media_content_type": media.get("media_content_type") or "music",
                        "enqueue": "replace",
                    })
                elif len(items) == 1:
                    await self._call("music_assistant", "play_media", {
                        "entity_id": player, "media_id": items[0],
                        "media_type": card.get("media_type") or "playlist", "enqueue": "replace",
                    })
                elif len(items) > 1:
                    await self._call("music_assistant", "play_media", {
                        "entity_id": player, "media_id": items,
                        "media_type": card.get("media_type") or "audiobook", "enqueue": "replace",
                    })
                else:
                    _LOGGER.warning("Card %s has nothing to play", card.get("name"))
                    return
            # Remember what was started where (by a scan, the card page or the service), so that
            # "continue the same card" only resumes media this card really started on this speaker.
            self.store.data["last_tag"] = tag or None
            self.store.data["last_player"] = player
            self.store.schedule_save()
            self.current = {
                "card_id": card.get("id"), "name": card.get("name"), "tag_id": card.get("tag_id"),
                "started": datetime.now().isoformat(timespec="seconds"),
            }
            self._updated()

    async def async_button(self, kind: str | None) -> None:
        player = self.player
        if kind == BTN_PLAY_PAUSE:
            await self._call("media_player", "media_play_pause", {"entity_id": player}, quiet=True)
        elif kind == BTN_NEXT:
            await self._call("media_player", "media_next_track", {"entity_id": player}, quiet=True)
        elif kind == BTN_PREVIOUS:
            await self._call("media_player", "media_previous_track", {"entity_id": player}, quiet=True)
        elif kind in (BTN_VOLUME_UP, BTN_VOLUME_DOWN):
            state = self.hass.states.get(player)
            try:
                level = float(state.attributes.get("volume_level")) if state else 0.3
            except (TypeError, ValueError):
                level = 0.3
            step = float(self.conf.get(CONF_VOLUME_STEP, DEFAULT_VOLUME_STEP))
            level = min(level + step, self.max_volume) if kind == BTN_VOLUME_UP else max(level - step, MIN_VOLUME)
            await self._call("media_player", "volume_set", {"entity_id": player, "volume_level": round(level, 2)}, quiet=True)

    async def _pause_if_playing(self) -> None:
        state = self.hass.states.get(self.player)
        if state is not None and state.state == STATE_PLAYING:
            await self._call("media_player", "media_pause", {"entity_id": self.player}, quiet=True)

    async def async_stop_playback(self) -> None:
        await self._call("media_player", "media_pause", {"entity_id": self.player}, quiet=True)
