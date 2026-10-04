# Band Metronome

A metronome application for Xiaomi Smart Band 9 Pro, built with Vela JS.

[中文说明](README.md)

## Features

- 50–250 BPM, with two native wheels (tens + ones) and Tap Tempo.
- 2/4, 3/4, 4/4, and 6/8 meters. Each slot can use long, short, or no vibration.
- Independent vibration and flash controls, with dots showing the current position in the bar.
- Four color themes and locally saved preferences.
- Simplified Chinese and English interface, following the system language.

## Controls

Tap the central button on Home to start or stop.

| Gesture from Home | Action |
| --- | --- |
| Swipe left | Set tempo or use Tap Tempo |
| Swipe up | Choose a meter and edit per-beat vibration |
| Swipe down | Select a color theme |
| Swipe right | Exit the app; from a subpage, return home |

Tapping the BPM or meter also opens its page. Hold the meter to view the gesture guide. Entering a configuration page stops playback; start it manually after returning.

In 6/8, BPM counts dotted quarters. The six slots are grouped 3+3, so a bar lasts two seconds at 60 BPM. For Tap Tempo, tap the two main beats.

## Installation and limitations

The current version is **0.5.9**, in development/testing. It is not listed on AstroBox or Xiaomi's official store. You can build a debug RPK and install it with a compatible tool such as AstroBox. The [`release/astrobox`](https://github.com/kyn0v/xiaomi-band-metronome/tree/release/astrobox) branch currently contains release preparation materials only.

- Target device: Xiaomi Smart Band 9 Pro (336 × 480). Other devices are unverified.
- Foreground operation only. Playback keeps the screen on and stops when you exit or leave Home.
- Long vibration means longer duration, not greater strength. Pulses may overlap at high tempos or in 6/8, and an active pulse cannot be cut short. Test at a low tempo first.
- Automated tests cannot verify physical vibration timing, touch response, or battery use. Device testing is still required.
- Version 0.5.5 changed the package ID. Migrating from an earlier version creates a separate app, so preferences must be entered again.

## Development

Requires Node.js 20+ and npm. Python 3 is needed to regenerate icons.

```bash
npm ci --ignore-scripts
npm test
npm run build
```

Output: `dist/org.bandmetronome.app.debug.0.5.9.rpk`.

The current build uses the toolkit's shared debug signing key and is not a production release. See the [development guide](docs/development.md) for signing, testing, and publishing details.

## Feedback

Include the device model, firmware version, app version, and reproduction steps when reporting an [issue](https://github.com/kyn0v/xiaomi-band-metronome/issues). Redact personal information from screenshots or videos.

This is not an official Xiaomi or AstroBox application.
