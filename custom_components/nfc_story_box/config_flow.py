"""Set up NFC Story Box: by hand, or by moving over an earlier (pre-release) setup."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers import device_registry as dr, entity_registry as er, selector

from .const import (
    CONF_BUTTON_EVENT,
    CONF_CARD_PRESENT,
    CONF_DAILY_LIMIT,
    CONF_DISABLE_LEGACY,
    CONF_MIGRATE_FROM,
    LEGACY_DOMAIN,
    CONF_QUIET_END,
    CONF_QUIET_MAX_VOLUME,
    CONF_QUIET_START,
    CONF_QUIET_STORIES_ONLY,
    CONF_RECORD_STATS,
    CONF_SUMMARY_NOTIFY,
    CONF_ONLY_SPEAKER,
    CONF_PHONE_SCAN,
    CONF_PAUSE_ON_REMOVE,
    CONF_PLAYER,
    CONF_READER_DEVICE,
    CONF_RESUME_SAME_CARD,
    CONF_SOUND_SERVICE,
    CONF_START_VOLUME,
    CONF_VOLUME_STEP,
    DEFAULT_MAX_VOLUME,
    DEFAULT_START_VOLUME,
    DEFAULT_VOLUME_STEP,
    DOMAIN,
    notify_targets,
)

_LOGGER = logging.getLogger(__name__)

SETTING_KEYS = (
    CONF_READER_DEVICE, CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_PLAYER, CONF_START_VOLUME,
    CONF_VOLUME_STEP, CONF_PAUSE_ON_REMOVE, CONF_RESUME_SAME_CARD, CONF_SOUND_SERVICE,
)


def _fields(defaults: dict[str, Any], notify_options: list[str] | None = None) -> dict[str, tuple[Any, Any]]:
    """Every setting as (marker, selector), by key."""
    def opt(key: str) -> Any:
        return vol.Optional(key, description={"suggested_value": defaults.get(key)})

    def req(key: str, fallback: Any) -> Any:
        return vol.Required(key, default=defaults.get(key, fallback))

    slider = lambda lo, hi, step: selector.NumberSelector(  # noqa: E731
        selector.NumberSelectorConfig(min=lo, max=hi, step=step, mode=selector.NumberSelectorMode.SLIDER)
    )
    return {
        CONF_READER_DEVICE: (
            vol.Required(CONF_READER_DEVICE, default=defaults.get(CONF_READER_DEVICE, vol.UNDEFINED)),
            selector.DeviceSelector(selector.DeviceSelectorConfig(integration="esphome")),
        ),
        CONF_PLAYER: (
            vol.Required(CONF_PLAYER, default=defaults.get(CONF_PLAYER, vol.UNDEFINED)),
            selector.EntitySelector(selector.EntitySelectorConfig(domain="media_player", integration="music_assistant")),
        ),
        CONF_ONLY_SPEAKER: (req(CONF_ONLY_SPEAKER, False), selector.BooleanSelector()),
        CONF_PHONE_SCAN: (req(CONF_PHONE_SCAN, False), selector.BooleanSelector()),
        CONF_BUTTON_EVENT: (opt(CONF_BUTTON_EVENT), selector.EntitySelector(selector.EntitySelectorConfig(domain="event"))),
        CONF_CARD_PRESENT: (opt(CONF_CARD_PRESENT), selector.EntitySelector(selector.EntitySelectorConfig(domain="binary_sensor"))),
        CONF_SOUND_SERVICE: (opt(CONF_SOUND_SERVICE), selector.TextSelector()),
        CONF_START_VOLUME: (req(CONF_START_VOLUME, DEFAULT_START_VOLUME), slider(0, 1, 0.05)),
        CONF_VOLUME_STEP: (req(CONF_VOLUME_STEP, DEFAULT_VOLUME_STEP), slider(0.01, 0.2, 0.01)),
        CONF_PAUSE_ON_REMOVE: (req(CONF_PAUSE_ON_REMOVE, True), selector.BooleanSelector()),
        CONF_RESUME_SAME_CARD: (req(CONF_RESUME_SAME_CARD, True), selector.BooleanSelector()),
        CONF_QUIET_START: (opt(CONF_QUIET_START), selector.TimeSelector()),
        CONF_QUIET_END: (opt(CONF_QUIET_END), selector.TimeSelector()),
        CONF_QUIET_MAX_VOLUME: (req(CONF_QUIET_MAX_VOLUME, 0), slider(0, 1, 0.05)),
        CONF_QUIET_STORIES_ONLY: (req(CONF_QUIET_STORIES_ONLY, False), selector.BooleanSelector()),
        CONF_DAILY_LIMIT: (
            req(CONF_DAILY_LIMIT, 0),
            selector.NumberSelector(selector.NumberSelectorConfig(
                min=0, max=600, step=5, unit_of_measurement="min", mode=selector.NumberSelectorMode.BOX)),
        ),
        CONF_RECORD_STATS: (req(CONF_RECORD_STATS, True), selector.BooleanSelector()),
        CONF_SUMMARY_NOTIFY: (
            vol.Optional(CONF_SUMMARY_NOTIFY, description={"suggested_value": notify_targets(defaults.get(CONF_SUMMARY_NOTIFY))}),
            selector.SelectSelector(selector.SelectSelectorConfig(
                options=notify_options or [], multiple=True, custom_value=True, mode=selector.SelectSelectorMode.DROPDOWN)),
        ),
    }


# The settings page: groups, in order, and whether a group starts folded.
SECTIONS: dict[str, tuple[tuple[str, ...], bool]] = {
    "speaker": ((CONF_PLAYER, CONF_ONLY_SPEAKER, CONF_PHONE_SCAN, CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_SOUND_SERVICE), False),
    "playback": ((CONF_START_VOLUME, CONF_VOLUME_STEP, CONF_PAUSE_ON_REMOVE, CONF_RESUME_SAME_CARD), False),
    "limits": ((CONF_QUIET_START, CONF_QUIET_END, CONF_QUIET_MAX_VOLUME, CONF_QUIET_STORIES_ONLY, CONF_DAILY_LIMIT), True),
    "stats": ((CONF_RECORD_STATS, CONF_SUMMARY_NOTIFY), True),
}
OPTIONAL_TEXT = (CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_SOUND_SERVICE, CONF_QUIET_START, CONF_QUIET_END)


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    """First setup: a short flat form."""
    fields = _fields(defaults)
    keys = (CONF_READER_DEVICE, CONF_PLAYER, CONF_ONLY_SPEAKER, CONF_PHONE_SCAN, CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_START_VOLUME,
            CONF_VOLUME_STEP, CONF_PAUSE_ON_REMOVE, CONF_RESUME_SAME_CARD, CONF_SOUND_SERVICE)
    schema = {vol.Required(CONF_NAME, default=DEFAULT_NAME): selector.TextSelector()}
    schema.update({fields[k][0]: fields[k][1] for k in keys})
    return vol.Schema(schema)


def notify_options(hass: HomeAssistant) -> list[str]:
    """Notification actions that exist now (phones, tablets, groups), for the weekly summary's list."""
    skip = {"send_message"}  # works on entities, not on a plain message
    return sorted(f"notify.{name}" for name in hass.services.async_services_for_domain("notify") if name not in skip)


def _options_schema(hass: HomeAssistant, defaults: dict[str, Any]) -> vol.Schema:
    """The settings page: the same settings in folding groups."""
    options = notify_options(hass)
    for chosen in notify_targets(defaults.get(CONF_SUMMARY_NOTIFY)):
        if chosen not in options:
            options.append(chosen)
    fields = _fields(defaults, options)
    return vol.Schema({
        vol.Required(name): section(
            vol.Schema({fields[k][0]: fields[k][1] for k in keys}), {"collapsed": collapsed}
        )
        for name, (keys, collapsed) in SECTIONS.items()
    })


def _flatten(user_input: dict[str, Any]) -> dict[str, Any]:
    """The groups of the settings page back into one flat dict (a flat dict passes through)."""
    flat: dict[str, Any] = {}
    for key, value in user_input.items():
        if key in SECTIONS and isinstance(value, dict):
            flat.update(value)
        else:
            flat[key] = value
    return flat


def _problems(hass: HomeAssistant, data: dict[str, Any]) -> str | None:
    """The first thing wrong with the settings, as an error key."""
    sound = str(data.get(CONF_SOUND_SERVICE) or "").strip()
    if sound and (sound.count(".") != 1 or not all(sound.split("."))):
        return "invalid_service"
    raw = data.get(CONF_SUMMARY_NOTIFY)
    wanted = [raw] if isinstance(raw, str) and raw else list(raw or [])
    targets = notify_targets(wanted)
    if len(targets) != len([w for w in wanted if str(w).strip()]):
        return "invalid_service"
    if any(not hass.services.has_service(*t.split(".")) for t in targets):
        return "unknown_notify"
    if bool(data.get(CONF_QUIET_START)) != bool(data.get(CONF_QUIET_END)):
        return "quiet_incomplete"
    if data.get(CONF_QUIET_START) and data.get(CONF_QUIET_START) == data.get(CONF_QUIET_END):
        return "quiet_same"
    return None


def sound_service_for(hass: HomeAssistant, device_id: str | None) -> str:
    """The box's 'play sound' action, e.g. esphome.nfc_reader_play_sound, if it has one."""
    device = dr.async_get(hass).async_get(device_id) if device_id else None
    if device is None:
        return ""
    names = {device.name or ""}
    for entry_id in device.config_entries:
        cfg = hass.config_entries.async_get_entry(entry_id)
        if cfg and cfg.domain == "esphome":
            names.add(cfg.data.get("device_name") or "")
            names.add(cfg.title or "")
    for name in names:
        slug = "".join(ch if ch.isalnum() else "_" for ch in name.lower()).strip("_")
        if slug and hass.services.has_service("esphome", f"{slug}_play_sound"):
            return f"esphome.{slug}_play_sound"
    return ""


DEFAULT_NAME = "NFC Story Box"
CONF_NAME = "name"


class StoryBoxConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return StoryBoxOptionsFlow()

    def _legacy_entries(self) -> list[ConfigEntry]:
        """Entries of the pre-release version that have not been moved over yet."""
        moved = {e.data.get(CONF_MIGRATE_FROM) for e in self._async_current_entries(include_ignore=False)}
        return [e for e in self.hass.config_entries.async_entries(LEGACY_DOMAIN) if e.entry_id not in moved]

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if self._legacy_entries():
            return self.async_show_menu(step_id="user", menu_options=["migrate", "manual"])
        return await self.async_step_manual()

    async def async_step_migrate(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Take over the settings, cards and history of an earlier setup of this integration."""
        legacy = {e.entry_id: e for e in self._legacy_entries()}
        if not legacy:
            return self.async_abort(reason="nothing_to_migrate")
        if user_input is not None:
            old = legacy[user_input[CONF_MIGRATE_FROM]]
            await self.async_set_unique_id(old.unique_id or old.entry_id)
            self._abort_if_unique_id_configured()
            data = {
                **old.data, **old.options,
                CONF_MIGRATE_FROM: old.entry_id,
                CONF_DISABLE_LEGACY: bool(user_input.get(CONF_DISABLE_LEGACY, True)),
            }
            data.pop("import", None)
            return self.async_create_entry(title=str(user_input.get(CONF_NAME) or old.title).strip() or DEFAULT_NAME, data=data)
        first = next(iter(legacy.values()))
        schema = vol.Schema({
            vol.Required(CONF_MIGRATE_FROM, default=first.entry_id): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[selector.SelectOptionDict(value=k, label=e.title) for k, e in legacy.items()],
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(CONF_NAME, default=first.title): selector.TextSelector(),
            vol.Required(CONF_DISABLE_LEGACY, default=True): selector.BooleanSelector(),
        })
        return self.async_show_form(step_id="migrate", data_schema=schema)

    async def async_step_manual(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            data = dict(user_input)
            title = str(data.pop(CONF_NAME, "") or "").strip() or DEFAULT_NAME
            await self.async_set_unique_id(data[CONF_READER_DEVICE])
            self._abort_if_unique_id_configured()
            if not data.get(CONF_SOUND_SERVICE):
                data[CONF_SOUND_SERVICE] = sound_service_for(self.hass, data[CONF_READER_DEVICE])
            return self.async_create_entry(title=title, data=data)
        return self.async_show_form(step_id="manual", data_schema=_schema({}))


class StoryBoxOptionsFlow(OptionsFlow):
    """Change the speaker, buttons and behaviour later."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        current = {**self.config_entry.data, **self.config_entry.options}
        errors: dict[str, str] = {}
        if user_input is not None:
            flat = _flatten(user_input)
            for key in OPTIONAL_TEXT:
                flat[key] = str(flat.get(key) or "").strip()
            problem = _problems(self.hass, flat)
            if problem is None:
                flat[CONF_SUMMARY_NOTIFY] = notify_targets(flat.get(CONF_SUMMARY_NOTIFY))
                return self.async_create_entry(data=flat)
            errors["base"] = problem
            current = {**current, **flat}  # keep what was typed
        return self.async_show_form(step_id="init", data_schema=_options_schema(self.hass, current), errors=errors)
