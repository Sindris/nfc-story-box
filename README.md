# Vordísarvarpið

A Home Assistant integration for an NFC music and story player for small children:
lay a card on the box and it plays a playlist, an album or a whole series of audiobooks
through [Music Assistant](https://music-assistant.io/). It also gives you one page for
managing the cards and printing labels for them with their cover art.

The page is in Icelandic.

## What it does

- **Plays the cards.** Listens for NFC tags scanned by the box (an ESPHome NFC reader) and plays the
  card's media on a Music Assistant player: one item, or a series queued in order (optionally shuffled).
- **Behaves like a toy.** Puts the same card back on → continues where it stopped. Lifts the card → pauses.
  Start volume per card scan, and a maximum volume the box's buttons can't go past.
- **Buttons.** Play/pause, next, previous, volume up and down from the box's ESPHome event entity.
- **Sounds.** Calls the box's "play sound" action with `success` or `unknown`.
- **Card page** (`custom:vordisarvarpid-kortamidar-card`, loaded automatically):
  - all cards as label previews, grouped into music and stories;
  - one panel per card: search Music Assistant or paste a link (Spotify, `library://…`),
    find all books in a series, link the NFC card, label title / copies / own picture;
  - scanning a card opens it; scanning an unknown card offers to link or create it;
  - printing: 5 label styles, back labels, A4 cut sheets or HERMA 5028 sticker sheets,
    start on a half-used sheet, PDF download (works in the Home Assistant app).
- Everything is stored in Home Assistant (included in backups), so every device sees the same cards,
  label settings and print settings.

## Entities and actions

| | |
|---|---|
| `sensor.<box>_card_playing` | The card playing (or played last) |
| `number.<box>_max_volume` | Highest volume the buttons can turn the speaker up to |
| `vordisarvarpid.play_card` | Play a card by name or tag id |
| `vordisarvarpid.stop` | Pause the box's speaker |
| event `vordisarvarpid_card_scanned` | Fired for every scan on the box (`known`, `name`, `tag_id`) |

## Install

1. HACS → ⋮ → Custom repositories → add `https://github.com/Sindris/vordisarvarpid`, category *Integration*.
2. Download **Vordísarvarpið** and restart Home Assistant.
3. Settings → Devices & services → Add integration → **Vordísarvarpið**.
   If you used the *Tónaval – NFC spilari* blueprint, choose to move it over: cards, speaker and settings
   are copied and the old automation is switched off.
4. Add the card to a dashboard (panel view works best):

```yaml
type: custom:vordisarvarpid-kortamidar-card
```

## Requirements

- Home Assistant 2025.10 or newer, Music Assistant integration.
- An ESPHome NFC reader (PN532 or similar) that sends `tag_scanned`, optionally with an event entity
  for buttons and a binary sensor for "card on reader".
