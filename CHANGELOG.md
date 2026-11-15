# Changelog

## 1.3.0

Added
- Swedish: the integration (settings, entities, services, messages) and both cards are now available in
  Icelandic, English and Swedish. The language follows your Home Assistant profile language.
- The weekly summary message is written in the Home Assistant language (Icelandic, Swedish, otherwise English).

## 1.2.6

Improved
- The weekly summary's "send to" setting is now a list of the notification actions that exist in Home
  Assistant (phones, tablets, groups) where you can pick several, instead of a text field. Typing another
  action is still possible. A text value from an older version keeps working.

## 1.2.5

Improved
- The settings page is now in four folding groups (Speaker and reader, Playing, Quiet hours and limits,
  Statistics), and every setting has a short explanation.
- Settings are checked before saving: a half-set quiet period, a malformed action name, or a weekly-summary
  notification action that does not exist are refused with a clear message, and what was typed is kept.
- The first-setup form now has a label for "Play only on this speaker" too.

## 1.2.4

Fixed
- "Play only on the chosen speaker": the box now waits until Music Assistant has moved the speaker off the
  group's queue after the group is switched off. Before, the play command could switch the group on again.

## 1.2.3

Added
- New setting "Play only on the chosen speaker". When the speaker is a member of a Music Assistant group
  that is switched on, Music Assistant plays on the whole group. With this setting on, the box switches
  that group off first and plays on the chosen speaker alone. Off by default.

## 1.2.2

Fixed
- A Spotify audiobook (or other item Music Assistant can't look up by address) no longer shows
  "Not found in Music Assistant" when it can be found by its title.

## 1.2.1

Fixed
- On phones the card dialog's buttons (Save changes, Done) no longer end up under the navigation bar.
  The page uses the phone's reported bottom inset; if an app doesn't report it, set `safe_bottom: 48`
  (pixels) in the card's config.

## 1.2.0

New
- **Statistics card** `custom:vordisarvarpid-tolfraedi-card`: today / this week / daily average / plays,
  a bar chart per day (music and stories), most played cards, cards not played for 30+ days,
  a weekday × hour heat map, stories in progress, time per speaker and the latest plays.
- Listening is logged per day (card, hour, speaker, music or story) and kept for 90 days.
- Sensors "Listened this week" and "Most played card"; switch "Record statistics".
- Weekly summary on Sundays at 18:00: event `vordisarvarpid_weekly_summary`, plus a notification if an
  action is set in the settings; also available as the action `vordisarvarpid.weekly_summary`.
- Websocket commands `vordisarvarpid/stats` and `vordisarvarpid/reset_stats` (admin).

## 1.1.0

New
- Stories remember their place per card; a series can play the next book each time.
- Per card: own speaker, own start volume.
- Control cards: stop, sleep timer, change speaker, surprise.
- Quiet hours (lower maximum volume, optionally stories only), daily listening limit, sleep timer.
- "Listened today" sensor, play counts and history per card.
- Card page: link all NFC cards one after another; status line; control cards group.
- Diagnostics download and repair notices (speaker unavailable, Music Assistant missing).
- Actions `vordisarvarpid.sleep_timer` and `vordisarvarpid.set_speaker`.

Changed
- The same card put back while it is still playing no longer restarts it.
- Lifting a card only pauses what the box itself started.
- The maximum volume is held while the box plays, not only for the box's buttons.
- The "bye" sound is only played when the music really pauses (needs the firmware in `esphome/`).
- The PDF library and fonts ship with the integration; nothing is fetched from the internet.
- The card page is only downloaded on dashboards that show it.
- Changing labels and print settings, and playing unsaved cards, needs an administrator.
- The card dialog no longer jumps when a message appears.
- When the speaker is part of a Music Assistant group that is switched on, the box follows the group
  (pausing, limits and remembered places work there too).

## 1.0.0

First version as an integration (moved from the "Tónaval – NFC spilari" blueprint).
