"""Set up Vordísarvarpið: from the old blueprint automation, or by hand."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er, selector
from homeassistant.util.yaml import load_yaml

from .const import (
    BLUEPRINT_SUFFIX,
    CONF_BUTTON_EVENT,
    CONF_CARD_PRESENT,
    CONF_DAILY_LIMIT,
    CONF_DISABLE_AUTOMATION,
    CONF_QUIET_END,
    CONF_QUIET_MAX_VOLUME,
    CONF_QUIET_START,
    CONF_QUIET_STORIES_ONLY,
    CONF_RECORD_STATS,
    CONF_SUMMARY_NOTIFY,
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
)

_LOGGER = logging.getLogger(__name__)

SETTING_KEYS = (
    CONF_READER_DEVICE, CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_PLAYER, CONF_START_VOLUME,
    CONF_VOLUME_STEP, CONF_PAUSE_ON_REMOVE, CONF_RESUME_SAME_CARD, CONF_SOUND_SERVICE,
)


def _schema(defaults: dict[str, Any], *, with_reader: bool = True) -> vol.Schema:
    fields: dict[Any, Any] = {}
    if with_reader:
        fields[vol.Required(CONF_READER_DEVICE, default=defaults.get(CONF_READER_DEVICE, vol.UNDEFINED))] = (
            selector.DeviceSelector(selector.DeviceSelectorConfig(integration="esphome"))
        )
    fields.update({
        vol.Required(CONF_PLAYER, default=defaults.get(CONF_PLAYER, vol.UNDEFINED)): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="media_player", integration="music_assistant")
        ),
        vol.Optional(CONF_BUTTON_EVENT, description={"suggested_value": defaults.get(CONF_BUTTON_EVENT)}): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="event")
        ),
        vol.Optional(CONF_CARD_PRESENT, description={"suggested_value": defaults.get(CONF_CARD_PRESENT)}): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="binary_sensor")
        ),
        vol.Required(CONF_START_VOLUME, default=defaults.get(CONF_START_VOLUME, DEFAULT_START_VOLUME)): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0, max=1, step=0.05, mode=selector.NumberSelectorMode.SLIDER)
        ),
        vol.Required(CONF_VOLUME_STEP, default=defaults.get(CONF_VOLUME_STEP, DEFAULT_VOLUME_STEP)): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0.01, max=0.2, step=0.01, mode=selector.NumberSelectorMode.SLIDER)
        ),
        vol.Required(CONF_PAUSE_ON_REMOVE, default=defaults.get(CONF_PAUSE_ON_REMOVE, True)): selector.BooleanSelector(),
        vol.Required(CONF_RESUME_SAME_CARD, default=defaults.get(CONF_RESUME_SAME_CARD, True)): selector.BooleanSelector(),
        vol.Optional(CONF_SOUND_SERVICE, description={"suggested_value": defaults.get(CONF_SOUND_SERVICE)}): selector.TextSelector(),
    })
    if not with_reader:  # the extras are only in the settings, to keep the first setup short
        fields.update({
            vol.Optional(CONF_QUIET_START, description={"suggested_value": defaults.get(CONF_QUIET_START)}): selector.TimeSelector(),
            vol.Optional(CONF_QUIET_END, description={"suggested_value": defaults.get(CONF_QUIET_END)}): selector.TimeSelector(),
            vol.Required(CONF_QUIET_MAX_VOLUME, default=defaults.get(CONF_QUIET_MAX_VOLUME, 0)): selector.NumberSelector(
                selector.NumberSelectorConfig(min=0, max=1, step=0.05, mode=selector.NumberSelectorMode.SLIDER)
            ),
            vol.Required(CONF_QUIET_STORIES_ONLY, default=defaults.get(CONF_QUIET_STORIES_ONLY, False)): selector.BooleanSelector(),
            vol.Required(CONF_DAILY_LIMIT, default=defaults.get(CONF_DAILY_LIMIT, 0)): selector.NumberSelector(
                selector.NumberSelectorConfig(min=0, max=600, step=5, unit_of_measurement="min", mode=selector.NumberSelectorMode.BOX)
            ),
            vol.Required(CONF_RECORD_STATS, default=defaults.get(CONF_RECORD_STATS, True)): selector.BooleanSelector(),
            vol.Optional(CONF_SUMMARY_NOTIFY, description={"suggested_value": defaults.get(CONF_SUMMARY_NOTIFY)}): selector.TextSelector(),
        })
    return vol.Schema(fields)


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


async def find_blueprint_automation(hass: HomeAssistant) -> dict[str, Any] | None:
    """The automation made from the 'Tónaval – NFC spilari' blueprint, if there is one."""
    path = hass.config.path("automations.yaml")

    def _read() -> Any:
        try:
            return load_yaml(path)
        except Exception as err:  # noqa: BLE001 - no file or not readable: nothing to import
            _LOGGER.debug("Could not read %s: %s", path, err)
            return None

    data = await hass.async_add_executor_job(_read)
    if not isinstance(data, list):
        return None
    for auto in data:
        bp = auto.get("use_blueprint") if isinstance(auto, dict) else None
        if isinstance(bp, dict) and str(bp.get("path", "")).endswith(BLUEPRINT_SUFFIX):
            return auto
    return None


def settings_from_automation(hass: HomeAssistant, auto: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Box settings and stored data (cards, max volume, last card) from the blueprint inputs."""
    inp = dict(auto.get("use_blueprint", {}).get("input", {}))
    settings: dict[str, Any] = {
        CONF_READER_DEVICE: inp.get("reader_device"),
        CONF_PLAYER: inp.get("player"),
        CONF_BUTTON_EVENT: inp.get("button_event"),
        CONF_CARD_PRESENT: inp.get("card_present"),
        CONF_START_VOLUME: float(inp.get("start_volume", DEFAULT_START_VOLUME) or 0),
        CONF_VOLUME_STEP: float(inp.get("volume_step", DEFAULT_VOLUME_STEP) or DEFAULT_VOLUME_STEP),
        CONF_PAUSE_ON_REMOVE: bool(inp.get("pause_on_remove", True)),
        CONF_RESUME_SAME_CARD: bool(inp.get("resume_same_card", True)),
    }
    sound = ""
    for act in inp.get("on_known_card") or []:
        name = act.get("action") or act.get("service") if isinstance(act, dict) else None
        if name and name.endswith("_play_sound"):
            sound = name
    settings[CONF_SOUND_SERVICE] = sound or sound_service_for(hass, settings[CONF_READER_DEVICE])
    max_volume = float(inp.get("max_volume", DEFAULT_MAX_VOLUME) or DEFAULT_MAX_VOLUME)
    ent = inp.get("max_volume_entity")
    if isinstance(ent, str) and (st := hass.states.get(ent)) is not None:
        try:
            max_volume = float(st.state)
        except ValueError:
            pass
    last_tag = None
    mem = inp.get("memory_helper")
    if isinstance(mem, str) and (st := hass.states.get(mem)) is not None and st.state not in ("unknown", "unavailable", ""):
        last_tag = st.state
    stored = {"cards": list(inp.get("cards") or []), "max_volume": max_volume, "last_tag": last_tag}
    return {k: v for k, v in settings.items() if v not in (None, "")}, stored


def automation_entity(hass: HomeAssistant, auto_id: str | None) -> str | None:
    if not auto_id:
        return None
    return er.async_get(hass).async_get_entity_id("automation", "automation", str(auto_id))


class VordisConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow."""

    VERSION = 1

    def __init__(self) -> None:
        self._auto: dict[str, Any] | None = None

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return VordisOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        self._auto = await find_blueprint_automation(self.hass)
        if self._auto:
            return self.async_show_menu(step_id="user", menu_options=["import_blueprint", "manual"])
        return await self.async_step_manual()

    async def async_step_import_blueprint(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        assert self._auto is not None
        settings, stored = settings_from_automation(self.hass, self._auto)
        if not settings.get(CONF_READER_DEVICE) or not settings.get(CONF_PLAYER):
            return self.async_abort(reason="import_incomplete")
        await self.async_set_unique_id(settings[CONF_READER_DEVICE])
        self._abort_if_unique_id_configured()
        name = self._auto.get("alias") or "Tónaval"
        if user_input is None:
            return self.async_show_form(
                step_id="import_blueprint",
                data_schema=vol.Schema({vol.Required(CONF_DISABLE_AUTOMATION, default=True): selector.BooleanSelector()}),
                description_placeholders={"automation": name, "cards": str(len(stored["cards"]))},
            )
        data = {
            **settings,
            "import": {**stored, "automation_id": self._auto.get("id"),
                       "disable_automation": bool(user_input.get(CONF_DISABLE_AUTOMATION, True))},
        }
        return self.async_create_entry(title="Vordísarvarpið", data=data)

    async def async_step_manual(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_READER_DEVICE])
            self._abort_if_unique_id_configured()
            if not user_input.get(CONF_SOUND_SERVICE):
                user_input[CONF_SOUND_SERVICE] = sound_service_for(self.hass, user_input[CONF_READER_DEVICE])
            return self.async_create_entry(title="Vordísarvarpið", data=user_input)
        return self.async_show_form(step_id="manual", data_schema=_schema({}))


class VordisOptionsFlow(OptionsFlow):
    """Change the speaker, buttons and behaviour later."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        current = {**self.config_entry.data, **self.config_entry.options}
        if user_input is not None:
            for key in (CONF_BUTTON_EVENT, CONF_CARD_PRESENT, CONF_SOUND_SERVICE, CONF_QUIET_START, CONF_QUIET_END, CONF_SUMMARY_NOTIFY):
                user_input.setdefault(key, "")
            return self.async_create_entry(data=user_input)
        return self.async_show_form(step_id="init", data_schema=_schema(current, with_reader=False))
