# Xiaomi Band Metronome

A small, offline Xiaomi Vela JS application for Smart Band 9 Pro. No accounts,
network access, phone companion, or background playback.

## Version 0.5.5 — neutral application identity

The package ID is now `org.bandmetronome.app`, with no personal author name in the
identifier or installation filename. This is a new application identity: it does
not replace the earlier personal-namespace builds or automatically migrate their
settings. Note your old BPM/pattern/theme preferences and re-enter them after
installation. Keep the old app until the new one is verified; the build does not
uninstall applications from the device.

The publication repository starts from a clean source baseline with a neutral
project author identity. Earlier development history and legacy packages are kept
only in a separate local private backup, outside this repository and its delivery
folder. Do not upload that private backup. Future commits should retain the
repository-local project identity, or use an explicitly chosen public identity.

### Included review fixes

- Save status belongs to the shared preference store, so leaving a page cannot
  discard an asynchronous failure or turn an unsaved value into a false “Saved”.
  Tap the error text to retry the latest snapshot. Selecting the same BPM/theme
  also retries a failed save; already-saved values do not cause redundant writes.
- Rhythm cells have stable native `tid` values. Unchanged rows/cells keep their
  identities across save-status, color and tempo updates; a cell edit changes
  only its affected row, without an eager refresh followed by a second refresh.
- System back and custom right-swipe share a navigation guard in both event
  orders. The first system back follows native navigation; a duplicate is consumed.

No layout redesign or new page is included. Physical gesture behavior still needs
confirmation on the target firmware.

Launcher icon fix: `/common/icon.png` now has zero alpha outside its circular
badge instead of an opaque dark square. The badge and mint bars are unchanged.
The Python generator now reproduces this separate launcher asset as well as the
in-app control icons. A launcher-imposed tile or an old cached icon is outside
the PNG's control; check the application list after updating.

The 0.5.2 unified initialization fix across all four pages: subscribe to the app-owned
preference store during onInit. When cached settings exist they are applied
synchronously before the first render, including theme, BPM/unit, meter/grid,
output icons and onboarding. Hidden retained pages stay synchronized until
onDestroy unsubscribes them, so returning does not first expose old colors.

Only cold startup gates preference-dependent controls behind a neutral loading
view. Normal navigation no longer resets the ready flag or destroys/recreates the
slider, correcting the unnecessary remount introduced in 0.5.1. Publications do
not restart beats, reset Tap Tempo sampling, clear transient notices, or undo a
local hardware-failure disable. No new defaults are written on navigation.
Right-swipe/system back remains live during loading; a load failure shows a warning.
Tests cover pre-onShow state and retained pages, not physical frame capture: the
absence of native transition flashes still needs real-device confirmation.

Designed around a 336 × 480 display. Four focused pages, no permanent Exit/Back
buttons and no modal save/confirmation flow. Language follows the device locale
(Simplified Chinese or English fallback).

### Home: practice

- Meter, BPM with its note unit, a 192 px native circular play/stop button, beat
  dots, and two transparent-background output icons. Tap BPM for Tempo or the
  meter for Rhythm; hold the meter to reopen the gesture guide.
- **Left → Tempo; up → Rhythm; down → Colors; right → exit.**
- The selected theme colors enabled icons. Disabled icons are muted and slashed.
  Their 64 × 48 touch areas do not shrink when the background plate is removed.
- Output toggles briefly show “Vibration on/off” or “Flash on/off”, then restore
  the previous status. Storage/hardware errors take priority over these notices.
- The big button brightens briefly on each slot, a little more on the first slot.
  Beat dots track position even with flashing disabled or a silent vibration slot.
  There is **no full-screen strobe or hardware brightness modulation**. If the
  visual pulse is uncomfortable, disable Flash.
- Entering any configuration page stops playback and releases screen-on. Returning
  never auto-starts. Starting again always begins at the first slot.

### Tempo: speed and Tap Tempo

- A native slider, **50–250 BPM**, step 1; initial BPM is 120, saved BPM is retained.
- A **192 px circular Tap Tempo button**, with brief click feedback and progress.
  Four steady taps estimate BPM; obvious double taps/outliers are filtered.
  A two-second pause resets sampling. Out-of-range values are reported, not clamped.
- No Reset-to-120, +/- buttons, theme links, or rhythm controls on this page.
- In 6/8, tap the two main beats, not the six eighth notes. BPM is explicitly
  labelled “Dotted-quarter BPM”. Right swipe returns to Home.

### Rhythm: meter and per-slot vibration

Choose 2/4, 3/4, 4/4, or 6/8 using the header arrows. Each meter remembers its own
pattern. Tap a cell to cycle **Long → Short → None**. Changes save automatically;
editing does not itself trigger vibration.

| Meter | BPM unit | Editable slots | Grid |
| --- | --- | --- | --- |
| 2/4 | Quarter note | 2 | One row of two |
| 3/4 | Quarter note | 3 | One row of three |
| 4/4 | Quarter note | 4 | Two rows of two, in numbered order |
| 6/8 | Dotted quarter | 6 eighth notes | Two rows of three (3+3) |

Default patterns use Long on the first slot and Short on all others. You may
silence any slot or put Long elsewhere (for example the fourth slot in 6/8).
**None means no motor pulse, not removal of time.** The vibration icon on Home
mutes the entire pattern without changing it. The old global short/long setting
and single-pulse preview have been removed.

**6/8 example: 60 BPM = 60 dotted quarters/minute.** One eighth-note slot is
333.33 ms, the second main beat begins at 1 second, and the next bar begins at
2 seconds. Six visible cells do not make the bar six seconds long. There is no
separate subdivision switch or ambiguous BPM-unit toggle.

### Colors: four swatches

Mint (default), Sky blue, Lavender, and Amber, in a 2×2 grid. The selected swatch
has a marker. Selection previews on the page and persists across all pages and
restarts. No vibration settings or arbitrary color editor here.

## Navigation and native controls

Vela's `swipe` event recognizes quick flicks and does not bubble. Page navigation
uses its documented bubbling touchstart/move/end events, with viewport coordinates
and no speed requirement. A 36 px displacement and 1.5:1 dominant axis distinguish
navigation from taps/diagonals; axis locking prevents a vertical-then-horizontal
drag becoming an unintended back gesture. Moved touches suppress synthetic clicks
for 350 ms. Native slider touch streams are excluded from page navigation.

Native buttons still own hit-testing: no transparent input overlays or manual
circular hit regions. The first system `onBackPress` cleans up and returns false;
if navigation is already pending, it returns true to consume the duplicate.
A detected right swipe provides a fallback (router.back on subpages; app.terminate
on Home), sharing the same latch. Each onShow resets it. The welcome screen can also
be exited with right swipe while preferences are loading.

**Actual native touch delivery and system-back behavior must be verified on the
band.** Unit tests and successful packaging cannot guarantee firmware gesture
arbitration. There is intentionally no permanent Exit/Back button in this design.

## Timing and hardware limits

The clock schedules against intended timestamps, skips missed slots and advances
the musical position after stalls, and never emits a burst of catch-up pulses.
Tests cover fractional intervals for ten minutes, but JavaScript timers and the
physical motor are not real-time systems.

Band 9 Pro's documented `vibrator.vibrate` supports only `short` and `long` preset
durations. It provides no amplitude setter and does not support programmable
`vibrator.start`/`stop` tasks. **Long is not stronger; exact duration depends on the
firmware.** An already-started pulse cannot be interrupted, even after Stop.
No extra delayed pulses or undocumented intensity APIs are used.

Long pulses can overlap subsequent slots, especially at high BPM or in 6/8. At
250 dotted-quarter BPM, eighth-note slots are only 80 ms apart. The software can
schedule positions but cannot promise distinct motor feedback at that speed.
Test slowly first; choose Short/None or disable vibration if pulses merge. Pulse
flashes are capped to 40% of the slot duration (at most 100 ms), so visual feedback
finishes before the next slot. Turning Flash off leaves only beat-position dots.

No Bluetooth API or network permissions are requested. The cause of the earlier
reported phone disconnection was not established; observe real-device stability
rather than treating a new build as proof it cannot recur.

## Preferences and upgrades

The existing storage key is retained for future updates within the new package.
However, application storage is scoped by package ID: preferences from the previous
application identity do not carry over to 0.5.5 automatically. Subsequent same-ID
upgrades retain BPM, output enables, selected theme and onboarding state. Old global vibration duration, language and
screen-on overrides are ignored. New meter defaults to 4/4; each meter receives
its default pattern. Invalid values are normalized, writes are serialized, and
nested pattern arrays are copied at storage boundaries. Save failures remain in
the store across page navigation and can be explicitly retried. This status is
session-local: if a write failed and the app is terminated, the old disk values
remain. No automatic retry timer is used. Playback state is never persisted.

## Development and delivery

Node.js 20+ and npm; pinned `aiot-toolkit` 2.0.5. No runtime npm dependencies or new
toolchain packages were added. Builds have been run on macOS arm64, Node 26.8.2.
Identifiers, filenames and code comments use English; user-facing strings live in
`src/common/strings.js` with English and Simplified Chinese translations.

```bash
npm ci --ignore-scripts
python3 scripts/generate-icons.py
npm test
npm run build
```

Build output:

```text
dist/org.bandmetronome.app.debug.0.5.5.rpk
```

The owner installs from iCloud Drive. After validation, copy the exact package to:

```text
~/Library/Mobile Documents/com~apple~CloudDocs/MetronomeRpk/
```

Reveal that copy in Finder using `open -R`. iCloud synchronization is separate
from local copy success. Do not automatically install on the band, AirDrop, flash
firmware, unpair, or factory reset it. Prior packages can remain in that folder.

This is a **debug application package, not firmware**, signed using the toolkit's
shared development key. Do not use that key in production. Dependencies, build
outputs, archived RPKs, and private signing files are ignored by Git.

## Device acceptance checklist

Unit tests stub platform APIs and execute the actual page scripts. They do not
render Vela or establish motor timing. No physical device/simulator is controlled
by these tests. Version code is **13**. The 0.5.5 package-ID change requires a fresh
application install, not an in-place update of older builds; re-enter preferences.

1. Check the app-list icon on the launcher's background: there should be no
   asset-painted dark square around the circular badge.
   **Before playing**, right-swipe Home to exit. Reopen. Test left/up/down to each
   page, then right-swipe back. Repeat with slow swipes over buttons, icons, blank
   space and cells; no duplicate actions or stuck screen. Test system return.
2. Check all four pages in Chinese and English: no clipping at 336×480; each cell,
   swatch, native play button and native Tap button responds near its edges.
3. Choose a non-default theme and 6/8, then repeatedly visit all four pages and
   return home. Check that no default mint/4/4/120 state or old theme appears,
   including after an app restart. Check transparent icons in all four themes.
   Toggle each; brief text must appear, then disappear without altering timing.
4. At 4/4, 120 BPM, expect Long/Short/Short/Short. Stop/restart always begins at
   slot 1. Set slot 2 to None: its dot still advances, with no motor pulse there.
5. Set 6/8 to 60 BPM. Expect six dots over two seconds, arranged visually 3+3.
   Edit slot 4, switch meters and return; each meter must retain its pattern.
6. Save a non-default speed (for example 87 or 173), leave Tempo and reopen it
   repeatedly. Its first numeric/slider state should be the saved speed, not 120.
   Test 50 and 250 BPM via the slider; dragging the slider must never navigate.
   At fast rates check visual timing first, then assess whether vibration is
   usable. Stop and select Short/None if long pulses merge.
7. Tap four times at 500 ms intervals in simple meters: expect 120 BPM. In 6/8,
   tap each main beat at 1000 ms intervals: expect 60 dotted-quarter BPM.
   Neither operation should start playback. No reset button should be present.
8. Enable Flash: the main circle brightens, not the whole screen. Disable it:
   no main-circle pulses, but position dots continue. Stop cancels feedback.
9. Leaving Home for any page must stop timers and release screen-on. Reopening
   must not resume playback. Restart the app to verify BPM/theme/pattern retention.
10. Compare timing with a trusted reference and observe battery, comfort and
    connectivity. A motor pulse already started may finish after exiting.

Use Xiaomi AIoT-IDE with an appropriate Vela simulator for additional layout
checks. `npm start` exposes the vendor debug command; it does not install an
emulator. Keep debugger services on a trusted local network.

## Files

```text
src/app.ux                    Shared preferences
src/common/metronome.js       Meter-aware beat scheduler
src/common/rhythm.js          Meter definitions and normalized per-meter patterns
src/common/tap-tempo.js       Tap estimator (50–250 BPM)
src/common/preferences.js     Migration, validation, serialized writes
src/common/page-swipe.js      Four-direction page gesture observer
src/common/themes.js          Four palettes and pulse colors
src/common/strings.js         English and Simplified Chinese
src/pages/index/index.ux      Practice, output toggles, feedback, navigation
src/pages/tempo/index.ux      Slider and circular Tap Tempo
src/pages/rhythm/index.ux     Meter selector and editable cells
src/pages/appearance/index.ux Four theme swatches
scripts/generate-icons.py     Original alpha-transparent icons, standard Python
```

## Toolchain security

The initial audit reported 14 affected development-tool dependency entries
(11 high, 3 low), including inherited reports. They are not 14 independent flaws
or device-runtime npm dependencies. No forced toolkit changes were made.
Installing with lifecycle scripts disabled does not sandbox build tools or remove
advisories. Use trusted projects and archives; rerun audit/build/device validation
when updating the vendor toolkit.

## Official references

- [AIoT-IDE](https://iot.mi.com/vela/quickapp/zh/guide/start/use-ide.html)
- [Native button](https://iot.mi.com/vela/quickapp/zh/components/form/input.html)
- [Native slider](https://iot.mi.com/vela/quickapp/zh/components/form/slider.html)
- [Touch/swipe events](https://iot.mi.com/vela/quickapp/zh/components/general/events.html)
- [Page lifecycle and system back](https://iot.mi.com/vela/quickapp/zh/guide/framework/script/lifecycle.html)
- [App termination](https://iot.mi.com/vela/quickapp/zh/features/basic/app.html)
- [Vibration support](https://iot.mi.com/vela/quickapp/zh/features/system/vibrator.html)
- [Screen-on](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html)
- [Storage](https://iot.mi.com/vela/quickapp/zh/features/data/storage.html)
