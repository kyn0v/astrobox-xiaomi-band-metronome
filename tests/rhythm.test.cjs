const test = require('node:test')
const assert = require('node:assert/strict')
const { METERS, getMeter, defaultPattern, normalizePatterns, nextMode } = require('../src/common/rhythm')
const { createMetronome } = require('../src/common/metronome')
const { createPreferenceStore, normalizePreferences } = require('../src/common/preferences')
const { fakeClock, pageHarness } = require('./helpers.cjs')

function openRhythm(h) {
  h.page.openRhythm()
  h.page.onHide()
  return h.createPage('rhythm')
}

test('four meter definitions have explicit quarter/dotted-quarter timing and default patterns', () => {
  assert.deepEqual(METERS, ['2/4', '3/4', '4/4', '6/8'])
  for (const id of METERS) {
    assert.equal(getMeter(id).slots, Number(id[0]))
    assert.equal(getMeter(id).divisions, id === '6/8' ? 3 : 1)
    assert.equal(defaultPattern(id)[0], 'long')
    assert.ok(defaultPattern(id).slice(1).every(mode => mode === 'short'))
  }
  assert.equal(getMeter('9/8').id, '4/4')
  assert.deepEqual(['long', 'short', 'off'].map(nextMode), ['short', 'off', 'long'])
})

test('malformed patterns are bounded, normalized, and never aliased to input', () => {
  const input = { '2/4': ['off', 'invalid', 'long'], '3/4': 'bad', '6/8': ['short'] }
  const patterns = normalizePatterns(input)
  assert.deepEqual(patterns['2/4'], ['off', 'short'])
  assert.deepEqual(patterns['3/4'], ['long', 'short', 'short'])
  assert.deepEqual(patterns['6/8'], ['short', 'short', 'short', 'short', 'short', 'short'])
  patterns['2/4'][0] = 'long'
  assert.equal(input['2/4'][0], 'off')
  const prefs = normalizePreferences({ meter: 'invalid', patterns: input, bpm: 137, theme: 'blue' })
  assert.equal(prefs.meter, '4/4')
  assert.equal(prefs.bpm, 137)
  assert.equal(prefs.theme, 'blue')
})

test('store snapshots, update return values, and pending storage writes isolate nested patterns', () => {
  let request
  const store = createPreferenceStore({ get(o) { o.success('') }, set(o) { request = o } })
  store.load(value => { value.patterns['4/4'][0] = 'off' })
  store.load(value => assert.equal(value.patterns['4/4'][0], 'long'))
  const patterns = normalizePatterns()
  patterns['4/4'][1] = 'off'
  const result = store.update({ patterns })
  patterns['4/4'][1] = 'long'
  result.patterns['4/4'][1] = 'short'
  store.load(value => assert.equal(value.patterns['4/4'][1], 'off'))
  assert.equal(JSON.parse(request.value).patterns['4/4'][1], 'off')
})

test('rhythm grid is 2, 3, 2x2, or 3+3 and each meter remembers its own edits', () => {
  const h = pageHarness({ preferences: { bpm: 157, meter: '4/4' } })
  const r = openRhythm(h)
  assert.equal(r.rowTop.length, 2)
  assert.equal(r.rowBottom.length, 2)
  r.cycleSlot(1) // Short -> off.
  assert.equal(h.stored().patterns['4/4'][1], 'off')
  r.nextMeter()
  assert.equal(r.meter, '6/8')
  assert.equal(r.rowTop.length, 3)
  assert.equal(r.rowBottom.length, 3)
  assert.deepEqual(Array.from(r.rowBottom, cell => cell.index), [3, 4, 5])
  r.cycleSlot(3) // Short -> off -> long.
  r.cycleSlot(3)
  r.nextMeter()
  assert.equal(r.meter, '2/4')
  assert.equal(r.rowTop.length, 2)
  assert.equal(r.rowBottom.length, 0)
  r.nextMeter()
  assert.equal(r.meter, '3/4')
  assert.equal(r.rowTop.length, 3)
  assert.equal(r.rowBottom.length, 0)
  r.nextMeter()
  assert.equal(r._patterns['4/4'][1], 'off')
  r.nextMeter()
  assert.equal(r._patterns['6/8'][3], 'long')
  assert.equal(h.stored().bpm, 157)
  r.goBack()
  r.onHide()
  h.page.onShow()
  assert.equal(h.page.meter, '6/8')
  assert.equal(h.page.beatSlots.length, 6)
  assert.equal(h.page.running, false)
  const restarted = pageHarness({ preferences: h.stored() })
  assert.equal(restarted.page.meter, '6/8')
  assert.equal(restarted.page._pattern[3], 'long')
})

test('rhythm ignores invalid indexes, not-ready edits, and hidden or navigating page input', () => {
  const h = pageHarness({ deferLoad: true })
  h.page.onHide()
  const r = h.createPage('rhythm')
  r.nextMeter()
  r.cycleSlot(0)
  assert.equal(h.calls.writes.length, 0)
  h.finishLoad()
  for (const i of [-1, 99, 1.5, '1', NaN]) r.cycleSlot(i)
  assert.equal(h.calls.writes.length, 0)
  r.onHide()
  r.nextMeter()
  r.cycleSlot(0)
  assert.equal(h.calls.writes.length, 0)
  r.onShow()
  r.goBack()
  r.cycleSlot(0)
  assert.equal(h.calls.writes.length, 0)
})

test('rapid pattern edits remain serialized and failure is visible', () => {
  const h = pageHarness({ deferSaves: true, locale: 'zh-CN' })
  const r = openRhythm(h)
  r.cycleSlot(0) // long -> short
  r.cycleSlot(0) // short -> off
  r.cycleSlot(1) // short -> off
  assert.equal(h.pendingSaves(), 1)
  h.finishSave()
  assert.equal(h.pendingSaves(), 1)
  h.finishSave()
  assert.deepEqual(h.stored().patterns['4/4'], ['off', 'off', 'short', 'short'])
  r.cycleSlot(2)
  h.finishSave(false)
  assert.equal(r.status, '保存失败，点此重试')
})

for (const meter of METERS) {
  test(`${meter} scheduler preserves musical positions and bar duration`, () => {
    const clock = fakeClock()
    const events = []
    const m = createMetronome((index, interval) => events.push({ index, interval, time: clock.now() }), clock)
    m.setMeter(meter)
    m.setBpm(60)
    m.start()
    const definition = getMeter(meter)
    const duration = 1000 / definition.divisions
    const barTime = definition.slots * duration
    clock.advance(Math.ceil(barTime))
    assert.deepEqual(events.map(e => e.index), [...Array(definition.slots).keys(), 0])
    for (let i = 0; i < events.length; i++) {
      assert.ok(Math.abs(events[i].time - i * duration) <= 1.01)
      assert.equal(events[i].interval, duration)
    }
    m.stop()
    assert.equal(clock.pending(), 0)
  })
}

test('6/8 at 60 dotted-quarter BPM has six eighths and a 2-second bar, not six seconds', () => {
  const clock = fakeClock()
  const events = []
  const m = createMetronome(index => events.push([clock.now(), index]), clock)
  m.setMeter('6/8')
  m.setBpm(60)
  m.start()
  clock.advance(2000)
  assert.deepEqual(events, [[0, 0], [334, 1], [667, 2], [1000, 3], [1334, 4], [1667, 5], [2000, 0]])
})

test('stalls skip both elapsed subdivisions and their positions instead of bursting', () => {
  const clock = fakeClock()
  const indexes = []
  const m = createMetronome(index => indexes.push(index), clock)
  m.setMeter('6/8')
  m.setBpm(120) // 166.67 ms per eighth, 1000 ms per bar.
  m.start()
  clock.lateTick(1260) // Position 7, i.e. index 1, not the next queued index by coincidence.
  assert.deepEqual(indexes, [0, 1])
  clock.advance(74)
  assert.deepEqual(indexes, [0, 1, 2])
  assert.equal(clock.pending(), 1)
})

test('6/8 fractional subdivisions do not drift over ten minutes', () => {
  const clock = fakeClock()
  let count = 0
  const bpm = 137
  const m = createMetronome(index => {
    assert.equal(index, count % 6)
    assert.ok(Math.abs(clock.now() - count * 60000 / bpm / 3) <= 1.01)
    count++
  }, clock)
  m.setMeter('6/8')
  m.setBpm(bpm)
  m.start()
  clock.advance(600000)
  assert.ok(count >= 4110)
})

test('changing meters stops the old stream; every restart begins at the first slot', () => {
  const clock = fakeClock()
  const indexes = []
  const m = createMetronome(index => indexes.push(index), clock)
  m.start()
  clock.advance(500)
  assert.deepEqual(indexes, [0, 1])
  m.setMeter('6/8')
  assert.equal(clock.pending(), 0)
  clock.advance(2000)
  m.start()
  assert.deepEqual(indexes, [0, 1, 0])
  m.start()
  assert.equal(clock.pending(), 1)
})

test('long/short/off outputs preserve rests and visual positions across bar boundaries', () => {
  const h = pageHarness({ preferences: { meter: '4/4', bpm: 120, patterns: { '4/4': ['long', 'off', 'short', 'off'] } } })
  h.page.toggleRunning()
  assert.equal(h.page.currentBeat, 0)
  assert.deepEqual(h.calls.vibrations, ['long'])
  h.clock.advance(500)
  assert.equal(h.page.currentBeat, 1)
  assert.equal(h.page.lit, true)
  assert.deepEqual(h.calls.vibrations, ['long'])
  h.clock.advance(500)
  assert.equal(h.page.currentBeat, 2)
  assert.deepEqual(h.calls.vibrations, ['long', 'short'])
  h.clock.advance(1000)
  assert.equal(h.page.currentBeat, 0)
  assert.deepEqual(h.calls.vibrations, ['long', 'short', 'long'])
  h.page.stop()
  assert.equal(h.page.currentBeat, -1)
  assert.equal(h.clock.pending(), 0)
})

test('all-silent patterns still advance; global output toggles do not rewrite patterns', () => {
  const h = pageHarness({ preferences: { meter: '3/4', patterns: { '3/4': ['off', 'off', 'off'] } } })
  h.page.toggleRunning()
  h.clock.advance(500)
  assert.equal(h.page.currentBeat, 1)
  h.page.toggleFlash()
  h.page.toggleVibration()
  h.clock.advance(500)
  assert.equal(h.page.currentBeat, 2)
  assert.equal(h.page.lit, false)
  assert.deepEqual(h.calls.vibrations, [])
  assert.deepEqual(h.stored().patterns['3/4'], ['off', 'off', 'off'])
})

test('fast compound flashes finish before the next eighth; stop clears all feedback', () => {
  const h = pageHarness({ preferences: { meter: '6/8', bpm: 250 } })
  h.page.toggleRunning()
  h.clock.advance(32)
  assert.equal(h.page.lit, false)
  h.clock.advance(48)
  assert.equal(h.page.currentBeat, 1)
  assert.equal(h.page.lit, true)
  h.page.toggleVibration()
  h.page.onHide()
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.page.lit, false)
})

test('Tap Tempo in 6/8 measures dotted quarters, not eighth-note subdivisions', () => {
  const h = pageHarness({ preferences: { meter: '6/8', bpm: 120 } })
  h.page.openTempo()
  h.page.onHide()
  const t = h.createPage('tempo')
  t.tapTempo()
  for (let i = 0; i < 3; i++) { h.clock.advance(1000); t.tapTempo() }
  assert.equal(t.meter, '6/8')
  assert.equal(t.bpm, 60)
  assert.equal(t.tapLit, true)
  assert.equal(h.stored().bpm, 60)
  assert.deepEqual(h.calls.vibrations, [])
  t.goBack()
  t.onHide()
  h.page.onShow()
  h.page.toggleRunning()
  h.clock.advance(334)
  assert.equal(h.page.currentBeat, 1)
  assert.deepEqual(h.calls.vibrations, ['long', 'short'])
})
