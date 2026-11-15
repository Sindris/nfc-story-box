# NFC Story Box

A Home Assistant integration for an NFC music and story player for small children:
lay a card on the box and it plays a playlist, an album or a whole series of audiobooks
through [Music Assistant](https://music-assistant.io/). It also gives you one page for
managing the cards and printing labels for them with their cover art.

The integration and cards are available in Icelandic, English and Swedish (they follow your Home Assistant language).

## What it does

- **Plays the cards.** Listens for NFC tags scanned by the box (an ESPHome NFC reader) and plays the
  card's media on a Music Assistant player: one item, or a series queued in order (optionally shuffled).
- **Behaves like a toy.** Same card back on → continues where it stopped. Card lifted → pauses
  (or keeps playing, per card). Only what the box started is paused, so other music on the same
  speaker is left alone.
- **Stories remember their place.** Swap to another card and come back later: an audiobook or a series
  continues in the same book at the same spot. A series can instead play *the next book each time*.
- **Per card:** shuffle, keep playing when lifted, its own speaker, its own start volume.
- **Control cards** do something instead of playing: stop, sleep timer, move to another speaker,
  or surprise (plays a random card).
- **Bedtime rules** (integration settings): quiet hours with a lower maximum volume, optionally story
  cards only; a daily listening limit; a sleep timer.
- **Statistics** (`custom:nfc-story-box-stats-card`): listening today and this week,
  a bar per day (music / stories), the most played cards, cards not played for 30+ days, when the box is
  used (weekday × hour), stories in progress, time per speaker and the latest plays. Kept for 90 days in
  Home Assistant only; can be switched off or cleared. A summary of the week goes out on Sundays at 18:00.
- **Phone as a second reader** (optional setting): a card held to a phone with the Home Assistant app
  plays just like on the box.
- **Maximum volume** is held while the box is playing, however the volume is changed.
- **Buttons.** Play/pause, next, previous, volume up and down from the box's ESPHome event entity.
- **Sounds.** Calls the box's "play sound" action with `success`, `unknown` or `removed`.
- **Card page** (`custom:nfc-story-box-card`, loaded automatically and only where it is shown):
  - all cards as label previews, grouped into music, stories and control cards, with play counts;
  - one panel per card: search Music Assistant or paste a link (Spotify, `library://…`),
    find all books in a series, link the NFC card, label title / copies / own picture;
  - scanning a card opens it; scanning an unknown card offers to link or create it;
  - **link all cards** in one go: the page shows the next card, you lay its NFC card on the box;
  - printing: 5 label styles, back labels, A4 cut sheets or HERMA 5028 sticker sheets,
    start on a half-used sheet, PDF download (works in the Home Assistant app and without internet).
- Everything is stored in Home Assistant (included in backups), so every device sees the same cards,
  label settings and print settings.

## Entities and actions

| | |
|---|---|
| `sensor.<box>_card_playing` | The card playing (or played last); attributes: speaker, sleep timer, quiet hours, last scan |
| `sensor.<box>_listened_today` | Minutes played today; attributes: limit, limit reached |
| `sensor.<box>_listened_this_week` | Minutes in the last 7 days; attributes: previous week, number of plays |
| `sensor.<box>_most_played_card` | The card played most in the last 30 days; attribute: top 3 |
| `number.<box>_max_volume` | Highest volume while the box is playing |
| `switch.<box>_pause_when_the_card_is_lifted` | Off = nothing pauses when a card is lifted |
| `nfc_story_box.play_card` | Play a card (or run a control card) by name or tag id |
| `nfc_story_box.stop` | Pause the box's speaker |
| `nfc_story_box.sleep_timer` | Pause after a number of minutes (0 cancels) |
| `switch.<box>_record_statistics` | Off = no listening statistics are recorded |
| `nfc_story_box.weekly_summary` | Send the summary of the week now (event `nfc_story_box_weekly_summary`, and a notification if set) |
| `nfc_story_box.set_speaker` | Play on another speaker from now on, moving what is playing |
| event `nfc_story_box_card_scanned` | Fired for every scan on the box (`known`, `blocked`, `name`, `tag_id`) |

Problems show up under Settings → Repairs (speaker unavailable, Music Assistant missing), and the
integration has a diagnostics download.

## Statistics card

Add it to any dashboard (a panel view works well):

```yaml
type: custom:nfc-story-box-stats-card
span: 30        # 7, 30 or 90 days (the page can change it)
```

Statistics are recorded from the moment version 1.2 is installed. In the integration's settings you can
turn recording off and set a notification action (for example `notify.mobile_app_phone`) that gets the
weekly summary on Sundays at 18:00; the event `nfc_story_box_weekly_summary` is always fired.

## Install

1. HACS → ⋮ → Custom repositories → add `https://github.com/Sindris/nfc-story-box`, category *Integration*.
2. Download **NFC Story Box** and restart Home Assistant.
3. Settings → Devices & services → Add integration → **NFC Story Box**. Pick the NFC reader, the
   Music Assistant speaker, and give the box a name (for example your child's name for it).
4. Add the card to a dashboard (panel view works best):

```yaml
type: custom:nfc-story-box-card
```

### Upgrading from the pre-release version

Before version 2.0 this integration was published as `vordisarvarpid`. If it is still installed,
**Add integration → NFC Story Box** offers *Move it over*: the cards, labels, history and settings are
copied and the old setup is switched off. Afterwards remove the old integration, update dashboards to the new
card types (`custom:nfc-story-box-card`, `custom:nfc-story-box-stats-card`) and the new action names
(`nfc_story_box.*`).

## Requirements

- Home Assistant 2025.10 or newer, Music Assistant integration.
- An ESPHome NFC reader (PN532 or similar) that sends `tag_scanned`, optionally with an event entity
  for buttons and a binary sensor for "card on reader".

## The box

`esphome/nfc-story-box-reader.yaml` is the firmware of the box this was built for: a Wemos D1 mini (ESP8266)
with a PN532 NFC reader on I²C (SDA GPIO4, SCL GPIO5), a passive buzzer on GPIO14 and three buttons
(play/pause GPIO2, next GPIO0, previous GPIO12; hold next/previous for volume). It needs `wifi_ssid` and
`wifi_password` in your ESPHome secrets. The device name `nfc-reader` is what the integration's automatic
"play sound" lookup expects (`esphome.nfc_reader_play_sound`); change it together with the sound action setting. Adding an `api: encryption:` key and an `ota: password:` is
recommended.

## Credits

Bundles [jsPDF](https://github.com/parallax/jsPDF) (MIT) and the fonts Baloo 2 and Inter (SIL Open Font
License), so labels can be printed without an internet connection.
