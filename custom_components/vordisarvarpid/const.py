"""Constants for Vordísarvarpið."""

from __future__ import annotations

DOMAIN = "vordisarvarpid"
VERSION = "1.3.0"

# Config entry data / options
CONF_READER_DEVICE = "reader_device"
CONF_BUTTON_EVENT = "button_event"
CONF_CARD_PRESENT = "card_present"
CONF_PLAYER = "player"
CONF_START_VOLUME = "start_volume"
CONF_VOLUME_STEP = "volume_step"
CONF_PAUSE_ON_REMOVE = "pause_on_remove"
CONF_RESUME_SAME_CARD = "resume_same_card"
CONF_SOUND_SERVICE = "sound_service"
CONF_QUIET_START = "quiet_start"
CONF_QUIET_END = "quiet_end"
CONF_QUIET_MAX_VOLUME = "quiet_max_volume"
CONF_QUIET_STORIES_ONLY = "quiet_stories_only"
CONF_DAILY_LIMIT = "daily_limit"
CONF_RECORD_STATS = "record_stats"
CONF_SUMMARY_NOTIFY = "summary_notify"
CONF_ONLY_SPEAKER = "only_speaker"
CONF_IMPORT_AUTOMATION = "import_automation"
CONF_DISABLE_AUTOMATION = "disable_automation"

DEFAULT_START_VOLUME = 0.0
DEFAULT_MAX_VOLUME = 0.6
DEFAULT_VOLUME_STEP = 0.04
MIN_VOLUME = 0.05

BLUEPRINT_SUFFIX = "tonaval_nfc_spilari.yaml"

# Events fired on the bus for the card page (and automations)
EVENT_CARD_SCANNED = f"{DOMAIN}_card_scanned"
EVENT_WEEKLY_SUMMARY = f"{DOMAIN}_weekly_summary"

STATS_DAYS = 90   # how many days of listening statistics are kept
MAX_PLAYS = 200   # how many recent plays are kept

# Button event types sent by the box
BTN_PLAY_PAUSE = "play_pause"
BTN_NEXT = "next"
BTN_PREVIOUS = "previous"
BTN_VOLUME_UP = "volume_up"
BTN_VOLUME_DOWN = "volume_down"

STORY_TYPES = ("audiobook", "podcast")

# Control cards: a card that does something instead of playing
ACTION_STOP = "stop"
ACTION_SLEEP = "sleep"
ACTION_SPEAKER = "speaker"
ACTION_SURPRISE = "surprise"
ACTIONS = (ACTION_STOP, ACTION_SLEEP, ACTION_SPEAKER, ACTION_SURPRISE)
DEFAULT_SLEEP_MINUTES = 15

FRONTEND_URL = f"/{DOMAIN}_static"
CARD_FILE = "vordisarvarpid-kortamidar-card.js"
LOADER_FILE = "vordisarvarpid-loader.js"
STATS_CARD_FILE = "vordisarvarpid-tolfraedi-card.js"

SIGNAL_UPDATED = f"{DOMAIN}_updated_{{}}"


def notify_targets(value: object) -> list[str]:
    """The notification actions in a setting: a list, or one text with actions separated by commas or spaces."""
    if isinstance(value, str):
        value = value.replace(",", " ").split()
    out: list[str] = []
    for item in value or []:
        item = str(item).strip()
        if item.count(".") == 1 and all(item.split(".")) and item not in out:
            out.append(item)
    return out
