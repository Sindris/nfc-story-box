"""The box itself: reacts to cards, buttons and lifting a card, and plays through Music Assistant."""

from __future__ import annotations

import asyncio
from datetime import datetime, time as dtime, timedelta
import logging
import random
import time
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_IDLE, STATE_OFF, STATE_PAUSED, STATE_PLAYING, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import CALLBACK_TYPE, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_state_change_event, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    ACTION_SLEEP,
    ACTION_SPEAKER,
    ACTION_STOP,
    ACTION_SURPRISE,
    BTN_NEXT,
    BTN_PLAY_PAUSE,
    BTN_PREVIOUS,
    BTN_VOLUME_DOWN,
    BTN_VOLUME_UP,
    CONF_BUTTON_EVENT,
    CONF_CARD_PRESENT,
    CONF_DAILY_LIMIT,
    CONF_PAUSE_ON_REMOVE,
    CONF_PLAYER,
    CONF_QUIET_END,
    CONF_QUIET_MAX_VOLUME,
    CONF_QUIET_START,
    CONF_QUIET_STORIES_ONLY,
    CONF_READER_DEVICE,
    CONF_RESUME_SAME_CARD,
    CONF_SOUND_SERVICE,
    CONF_START_VOLUME,
    CONF_VOLUME_STEP,
    DEFAULT_SLEEP_MINUTES,
    DEFAULT_START_VOLUME,
    DEFAULT_VOLUME_STEP,
    DOMAIN,
    EVENT_CARD_SCANNED,
    MIN_VOLUME,
    SIGNAL_UPDATED,
)
from .store import VordisStore, is_story, norm_tag, remembers

_LOGGER = logging.getLogger(__name__)

TICK = timedelta(seconds=30)
SETTLE = 10        # seconds after starting a card during which "idle" is just the queue being swapped
SEEK_WAIT = 8.0    # how long to wait for playback to start before jumping to the remembered place
SEEK_MIN = 15      # don't bother jumping back into the first seconds
SEEK_BACK = 5      # start a little before where it stopped
STOPPED = (STATE_IDLE, STATE_OFF)


def play_items(card: dict[str, Any]) -> list[str]:
    """The media a card plays, in order: its main media, then the rest of a series."""
    first = str(card.get("media_id") or "").strip()
    if not first and isinstance(card.get("media"), dict):
        first = str(card["media"].get("media_content_id") or "").strip()
    more = [x.strip() for x in str(card.get("more_media") or "").split("\n") if x.strip()]
    return ([first] if first else []) + more


def _parse_time(value: Any) -> dtime | None:
    try:
        return dtime.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


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
        self.applied_options: dict[str, Any] = {}  # options the running box was set up with
        # what the box itself started: only that is paused, limited and counted
        self._active = False
        self._active_player: str | None = None
        self._offset = 0                    # where in a series the queue started
        self._last_index = 0
        self._started = 0.0
        self._playing_since: float | None = None
        self._watched: str | None = None
        self._watch_unsub: CALLBACK_TYPE | None = None
        self._sleep_unsub: CALLBACK_TYPE | None = None
        self.sleep_until: datetime | None = None

    # ---- configuration
    @property
    def conf(self) -> dict[str, Any]:
        return {**self.entry.data, **self.entry.options}

    @property
    def default_player(self) -> str:
        chosen = self.store.data.get("speaker")
        if chosen and self.hass.states.get(chosen) is not None:
            return chosen
        return self.conf[CONF_PLAYER]

    @property
    def player(self) -> str:
        """The speaker the box is using now: where it last started something, else the default."""
        if self._active and self._active_player:
            return self._active_player
        return self._resolve(self.default_player)

    def _target(self, card: dict[str, Any]) -> str:
        own = card.get("player")
        if own and self.hass.states.get(own) is not None:
            return self._resolve(own)
        return self._resolve(self.default_player)

    def _resolve(self, player: str) -> str:
        """The speaker that really plays: the group, when this speaker is part of a group that is switched on.

        Music Assistant plays on the whole group then, and the speaker's own state stays idle.
        """
        state = self.hass.states.get(player)
        queue = state.attributes.get("active_queue") if state is not None else None
        if not queue:
            return player
        for other in self.hass.states.async_all("media_player"):
            if (
                other.entity_id != player
                and other.state not in (STATE_OFF, STATE_UNAVAILABLE, STATE_UNKNOWN)
                and other.attributes.get("active_queue") == queue
                and player in (other.attributes.get("group_members") or [])
            ):
                return other.entity_id
        return player

    @property
    def quiet(self) -> bool:
        start, end = _parse_time(self.conf.get(CONF_QUIET_START)), _parse_time(self.conf.get(CONF_QUIET_END))
        if start is None or end is None or start == end:
            return False
        now = dt_util.now().time()
        return start <= now < end if start < end else (now >= start or now < end)

    @property
    def max_volume(self) -> float:
        """The highest volume right now (lower during quiet hours, if set)."""
        level = self.base_max_volume
        quiet_max = float(self.conf.get(CONF_QUIET_MAX_VOLUME) or 0)
        if quiet_max > 0 and self.quiet:
            level = min(level, quiet_max)
        return level

    @property
    def base_max_volume(self) -> float:
        return float(self.store.data.get("max_volume") or 0.6)

    async def async_set_max_volume(self, value: float) -> None:
        self.store.data["max_volume"] = round(max(MIN_VOLUME, min(1.0, float(value))), 2)
        self.store.schedule_save()
        self._updated()

    # ---- listening time
    def _usage(self) -> dict[str, Any]:
        today = dt_util.now().date().isoformat()
        usage = self.store.data["usage"]
        if usage.get("date") != today:
            usage = self.store.data["usage"] = {"date": today, "seconds": 0}
        return usage

    @property
    def listened_today(self) -> int:
        """Seconds the box has played today."""
        extra = time.monotonic() - self._playing_since if self._playing_since is not None else 0
        return int(self._usage()["seconds"] + extra)

    @property
    def daily_limit(self) -> int:
        return int(float(self.conf.get(CONF_DAILY_LIMIT) or 0) * 60)

    @property
    def limit_reached(self) -> bool:
        return 0 < self.daily_limit <= self.listened_today

    def _account(self) -> None:
        """Add the time played since the last call to today's total and to the card's history."""
        now = time.monotonic()
        if self._playing_since is not None:
            spent = now - self._playing_since
            self._usage()["seconds"] += spent
            card = self._current_card()
            if card:
                hist = self.store.data["history"].setdefault(card["id"], {"count": 0})
                hist["seconds"] = round(hist.get("seconds", 0) + spent)
            self.store.schedule_save()
        state = self.hass.states.get(self._active_player) if self._active and self._active_player else None
        self._playing_since = now if state is not None and state.state == STATE_PLAYING else None

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
        self._unsubs.append(async_track_time_interval(self.hass, self._on_tick, TICK))
        last = self.store.card_for_tag(self.store.data.get("last_tag") or "")
        if last:
            self.current = {"card_id": last["id"], "name": last["name"], "tag_id": last.get("tag_id")}
        # after a restart: what is playing on the speaker we last used is still ours
        last_player = self.store.data.get("last_player")
        state = self.hass.states.get(last_player) if last_player else None
        if last and state is not None and state.state in (STATE_PLAYING, STATE_PAUSED):
            self._active, self._active_player = True, last_player
            pos = self.store.data["positions"].get(last["id"]) or {}
            self._offset = self._last_index = int(pos.get("index") or 0)
        self._watch(self.player)
        self._account()
        if not self.hass.config_entries.async_entries("music_assistant"):
            ir.async_create_issue(
                self.hass, DOMAIN, "no_music_assistant", is_fixable=False,
                severity=ir.IssueSeverity.WARNING, translation_key="no_music_assistant",
            )
        else:
            ir.async_delete_issue(self.hass, DOMAIN, "no_music_assistant")

    @callback
    def async_stop(self) -> None:
        self._account()
        self._playing_since = None
        while self._unsubs:
            self._unsubs.pop()()
        for unsub in (self._watch_unsub, self._sleep_unsub):
            if unsub:
                unsub()
        self._watch_unsub = self._sleep_unsub = None
        self._watched = None

    @callback
    def _watch(self, player: str) -> None:
        if player == self._watched:
            return
        if self._watch_unsub:
            self._watch_unsub()
        self._watched = player
        self._watch_unsub = async_track_state_change_event(self.hass, [player], self._on_player)

    @callback
    def _updated(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_UPDATED.format(self.entry.entry_id))

    def _current_card(self) -> dict[str, Any] | None:
        card_id = (self.current or {}).get("card_id")
        return self.store.card_by_id(card_id) if card_id else None

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
        blocked = self._blocked(card) if card else None
        self.last_scan = {
            "tag_id": event.data.get("tag_id"),
            "card_id": card["id"] if card else None,
            "name": card["name"] if card else None,
            "known": card is not None,
            "blocked": blocked,
            "time": dt_util.utcnow().isoformat(),
        }
        self.hass.bus.async_fire(EVENT_CARD_SCANNED, {"entry_id": self.entry.entry_id, **self.last_scan})
        self._updated()
        self.hass.async_create_task(self._handle_scan(card, blocked))

    def _blocked(self, card: dict[str, Any]) -> str | None:
        """Why a scanned card may not play now: 'limit' (today's listening is used up) or 'quiet' (stories only)."""
        if card.get("action"):
            return None
        if self.limit_reached:
            return "limit"
        if self.quiet and self.conf.get(CONF_QUIET_STORIES_ONLY) and not is_story(card):
            return "quiet"
        return None

    async def _handle_scan(self, card: dict[str, Any] | None, blocked: str | None) -> None:
        if card is None or blocked:
            await self._sound("unknown")
            return
        await self._sound("success")
        if card.get("action"):
            await self.async_run_action(card)
        else:
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

    @callback
    def _on_player(self, event: Event[EventStateChangedData]) -> None:
        """The speaker changed: keep time, notice the end, remember the place, hold the volume down."""
        old, new = event.data["old_state"], event.data["new_state"]
        self._account()
        if not self._active:
            return
        if new is None or new.state in (*STOPPED, STATE_UNAVAILABLE, STATE_UNKNOWN):
            if time.monotonic() - self._started < SETTLE:
                return
            if new is not None and new.state in STOPPED:
                self._ended(old)
                self._active, self._active_player = False, None
                self._account()
                self._updated()
            return
        if old is not None and old.state == STATE_PLAYING and new.state == STATE_PAUSED:
            self.hass.async_create_task(self._capture())
        self._hold_volume(new)

    def _ended(self, old: Any) -> None:
        """Playback stopped by itself. If that was the end of the story, start from the top next time."""
        card = self._current_card()
        if not card or old is None:
            return
        try:
            left = float(old.attributes["media_duration"]) - float(old.attributes["media_position"])
        except (KeyError, TypeError, ValueError):
            return
        if left < 30 and self._last_index >= len(play_items(card)) - 1:
            self.store.data["positions"].pop(card["id"], None)
            self.store.schedule_save()

    def _hold_volume(self, state: Any) -> None:
        try:
            level = float(state.attributes.get("volume_level"))
        except (TypeError, ValueError):
            return
        limit = self.max_volume
        if level > limit + 0.004:
            self.hass.async_create_task(self._call(
                "media_player", "volume_set", {"entity_id": state.entity_id, "volume_level": round(limit, 2)}, quiet=True,
            ))

    async def _on_tick(self, now: datetime) -> None:
        self._account()
        if not self._active:
            return
        state = self.hass.states.get(self.player)
        if state is None or state.state != STATE_PLAYING:
            return
        await self._capture()
        self._hold_volume(state)  # quiet hours may just have begun
        if self.limit_reached:
            _LOGGER.info("Today's listening time is used up; pausing")
            await self._pause()
            await self._sound("removed")
        self._updated()

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

    # -- remembering the place
    def _tracks(self, card: dict[str, Any]) -> bool:
        return remembers(card) and not card.get("next_each_time") and (len(play_items(card)) > 1 or is_story(card))

    async def _queue_info(self, player: str, card: dict[str, Any]) -> tuple[int, float] | None:
        """(index in the queue, seconds into it) for what the speaker plays, or None if that is not this card."""
        items = play_items(card)[self._offset:]
        if self.hass.services.has_service("music_assistant", "get_queue"):
            try:
                resp = await self.hass.services.async_call(
                    "music_assistant", "get_queue", {"entity_id": player}, blocking=True, return_response=True
                )
                queue = (resp or {}).get(player) or {}
                if int(queue.get("items") or 0) != len(items):
                    return None  # someone put something else on the speaker
                return int(queue.get("current_index") or 0), float(queue.get("elapsed_time") or 0)
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("get_queue failed: %s", err)
        state = self.hass.states.get(player)
        if state is None:
            return None
        uri = state.attributes.get("media_content_id")
        if uri in items:
            index = items.index(uri)
        elif len(items) == 1:
            index = 0
        else:
            return None
        try:
            elapsed = float(state.attributes.get("media_position") or 0)
        except (TypeError, ValueError):
            elapsed = 0
        at = state.attributes.get("media_position_updated_at")
        if state.state == STATE_PLAYING and isinstance(at, datetime):
            elapsed += max(0.0, (dt_util.utcnow() - at).total_seconds())
        return index, elapsed

    async def _capture(self) -> None:
        """Remember where the current story is."""
        card = self._current_card()
        if not (self._active and self._active_player and card and self._tracks(card)):
            return
        state = self.hass.states.get(self._active_player)
        if state is None or state.state not in (STATE_PLAYING, STATE_PAUSED):
            return
        info = await self._queue_info(self._active_player, card)
        if info is None:
            return
        self._last_index = self._offset + info[0]
        self.store.data["positions"][card["id"]] = {
            "index": self._last_index, "elapsed": int(info[1]), "time": dt_util.utcnow().isoformat(),
        }
        self.store.schedule_save()

    async def _pause(self) -> None:
        await self._capture()
        await self._call("media_player", "media_pause", {"entity_id": self.player}, quiet=True)

    # -- playing
    async def async_play_card(self, card: dict[str, Any], *, from_scan: bool = False) -> None:
        """Play a card, or continue it if it is the same card and playback is paused."""
        async with self._lock:
            player = self._target(card)
            tag = norm_tag(card.get("tag_id"))
            state = self.hass.states.get(player)
            if state is None or state.state == STATE_UNAVAILABLE:
                # Nothing can play there; don't let this count as the "last card".
                _LOGGER.warning(
                    "Speaker %s is %s; cards need a Music Assistant player (check the integration's settings)",
                    player, state.state if state else "missing",
                )
                ir.async_create_issue(
                    self.hass, DOMAIN, f"speaker_{self.entry.entry_id}", is_fixable=False,
                    severity=ir.IssueSeverity.WARNING, translation_key="speaker_unavailable",
                    translation_placeholders={"speaker": player},
                )
                return
            ir.async_delete_issue(self.hass, DOMAIN, f"speaker_{self.entry.entry_id}")
            same = (
                from_scan
                and self.conf.get(CONF_RESUME_SAME_CARD, True)
                and bool(tag)
                and self.store.data.get("last_tag") == tag
                and self.store.data.get("last_player") == player
            )
            if same and self._active and state.state == STATE_PLAYING:
                return  # the same card went back on while it is still playing: leave it alone
            if same and state.state == STATE_PAUSED:
                await self._call("media_player", "media_play", {"entity_id": player})
                self._active, self._active_player = True, player
                self._started = time.monotonic()
            else:
                items = play_items(card)
                if not items:
                    _LOGGER.warning("Card %s has nothing to play", card.get("name"))
                    return
                # leave the previous card tidily: remember its place, and stop it if it is on another speaker
                await self._capture()
                if self._active and self._active_player and self._active_player != player:
                    await self._call("media_player", "media_pause", {"entity_id": self._active_player}, quiet=True)
                self._account()

                index, seek = 0, 0.0
                if card.get("next_each_time") and len(items) > 1 and card.get("id"):
                    index = int(self.store.data["series_next"].get(card["id"]) or 0) % len(items)
                    self.store.data["series_next"][card["id"]] = (index + 1) % len(items)
                elif self._tracks(card) and card.get("id"):
                    pos = self.store.data["positions"].get(card["id"]) or {}
                    if 0 <= int(pos.get("index") or 0) < len(items):
                        index, seek = int(pos.get("index") or 0), float(pos.get("elapsed") or 0)
                queue = items[index:]

                start = float(card.get("start_volume") or self.conf.get(CONF_START_VOLUME, DEFAULT_START_VOLUME) or 0)
                if start > 0:
                    await self._call(
                        "media_player", "volume_set",
                        {"entity_id": player, "volume_level": round(min(start, self.max_volume), 2)}, quiet=True,
                    )
                await self._call(
                    "media_player", "shuffle_set", {"entity_id": player, "shuffle": bool(card.get("shuffle"))}, quiet=True
                )
                await self._call("media_player", "repeat_set", {"entity_id": player, "repeat": "off"}, quiet=True)
                media = card.get("media")
                if isinstance(media, dict) and media.get("media_content_id") and not card.get("media_id") and len(items) == 1:
                    await self._call("media_player", "play_media", {
                        "entity_id": player,
                        "media_content_id": media["media_content_id"],
                        "media_content_type": media.get("media_content_type") or "music",
                        "enqueue": "replace",
                    })
                else:
                    await self._call("music_assistant", "play_media", {
                        "entity_id": player, "media_id": queue[0] if len(queue) == 1 else queue,
                        "media_type": card.get("media_type") or ("playlist" if len(items) == 1 else "audiobook"),
                        "enqueue": "replace",
                    })
                self._active, self._active_player = True, player
                self._offset = self._last_index = index
                self._started = time.monotonic()
                if card.get("id"):
                    hist = self.store.data["history"].setdefault(card["id"], {"count": 0})
                    hist["count"] = int(hist.get("count") or 0) + 1
                    hist["last"] = dt_util.utcnow().isoformat()
                if seek >= SEEK_MIN:
                    await self._seek(player, seek - SEEK_BACK)
            # Remember what was started where (by a scan, the card page or the service), so that
            # "continue the same card" only resumes media this card really started on this speaker.
            self.store.data["last_tag"] = tag or None
            self.store.data["last_player"] = player
            self.store.schedule_save()
            self.current = {
                "card_id": card.get("id"), "name": card.get("name"), "tag_id": card.get("tag_id"),
                "started": dt_util.now().isoformat(timespec="seconds"),
            }
            self._watch(player)
            self._account()
            self._updated()

    async def _seek(self, player: str, position: float) -> None:
        waited = 0.0
        while waited < SEEK_WAIT:
            state = self.hass.states.get(player)
            if state is not None and state.state == STATE_PLAYING:
                break
            await asyncio.sleep(0.25)
            waited += 0.25
        await self._call("media_player", "media_seek", {"entity_id": player, "seek_position": round(position)}, quiet=True)

    # -- control cards
    async def async_run_action(self, card: dict[str, Any]) -> None:
        action = card.get("action")
        if action == ACTION_STOP:
            await self.async_stop_playback()
        elif action == ACTION_SLEEP:
            await self.async_sleep_timer(int(card.get("minutes") or DEFAULT_SLEEP_MINUTES))
        elif action == ACTION_SPEAKER:
            await self.async_set_speaker(card.get("player"))
        elif action == ACTION_SURPRISE:
            current = (self.current or {}).get("card_id")
            choices = [
                c for c in self.store.cards
                if not c.get("action") and play_items(c) and not self._blocked(c) and c["id"] != current
            ]
            if choices:
                await self.async_play_card(random.choice(choices))

    async def async_sleep_timer(self, minutes: int) -> None:
        """Stop the music after this many minutes (0 = cancel the timer)."""
        if self._sleep_unsub:
            self._sleep_unsub()
        self._sleep_unsub, self.sleep_until = None, None
        if minutes > 0:
            self.sleep_until = dt_util.now() + timedelta(minutes=minutes)
            self._sleep_unsub = async_call_later(self.hass, minutes * 60, self._sleep_done)
        self._updated()

    async def _sleep_done(self, now: datetime) -> None:
        self._sleep_unsub, self.sleep_until = None, None
        if self._active:
            await self._pause()
        self._updated()

    async def async_set_speaker(self, player: str | None) -> None:
        """Play on another speaker from now on (None = back to the one in the settings); moves what is playing."""
        if player and self.hass.states.get(player) is None:
            player = None
        old = self._active_player if self._active else None
        self.store.data["speaker"] = player or None
        self.store.schedule_save()
        new = self.default_player
        if old and old != new and self.hass.services.has_service("music_assistant", "transfer_queue"):
            state = self.hass.states.get(old)
            if state is not None and state.state in (STATE_PLAYING, STATE_PAUSED):
                await self._call(
                    "music_assistant", "transfer_queue",
                    {"entity_id": new, "source_player": old, "auto_play": state.state == STATE_PLAYING}, quiet=True,
                )
                self._active_player = new
                self._started = time.monotonic()
                self.store.data["last_player"] = new
        self._watch(self.player)
        self._account()
        self._updated()

    # -- buttons, lifting, stopping
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
        """The card was lifted off. Only what the box started is paused, and each card decides for itself."""
        if not self._active:
            return
        card = self._current_card()
        if card and card.get("keep_playing"):
            return
        state = self.hass.states.get(self.player)
        if state is not None and state.state == STATE_PLAYING:
            await self._pause()
            await self._sound("removed")

    async def async_stop_playback(self) -> None:
        await self._pause()
