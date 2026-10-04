const test = require('node:test')
const assert = require('node:assert/strict')
const timing = require('../src/common/metronome')
const { fakeClock, pageHarness } = require('./helpers.cjs')

function setup(bpm = 120) {
  const clock = fakeClock()
  const beats = []
  const metronome = timing.createMetronome(() => beats.push(clock.now()), clock)
  metronome.setBpm(bpm)
  return { clock, beats, metronome }
}

test('120 BPM starts immediately and ticks every 500 ms', () => {
  const { clock, beats, metronome } = setup()
  metronome.start()
  clock.advance(2000)
  assert.deepEqual(beats, [0, 500, 1000, 1500, 2000])
})

test('repeated start and stop do not duplicate or leak timers', () => {
  const { clock, beats, metronome } = setup()
  metronome.start()
  metronome.start()
  assert.equal(clock.pending(), 1)
  metronome.stop()
  metronome.stop()
  clock.advance(1000)
  assert.deepEqual(beats, [0])
  assert.equal(clock.pending(), 0)
  metronome.start()
  clock.advance(500)
  assert.deepEqual(beats, [0, 1000, 1500])
})

test('a late callback does not shift later deadlines', () => {
  const { clock, beats, metronome } = setup()
  metronome.start()
  clock.lateTick(530)
  assert.equal(clock.nextAt(), 1000)
  clock.advance(470)
  assert.deepEqual(beats, [0, 530, 1000])
})

test('a long stall skips missed beats instead of producing a burst', () => {
  const { clock, beats, metronome } = setup()
  metronome.start()
  clock.lateTick(2600)
  assert.deepEqual(beats, [0, 2600])
  assert.equal(clock.pending(), 1)
  assert.equal(clock.nextAt(), 3000)
})

test('changing tempo replaces the pending timer without an extra immediate beat', () => {
  const { clock, beats, metronome } = setup()
  metronome.start()
  clock.advance(200)
  metronome.setBpm(60)
  assert.equal(clock.pending(), 1)
  assert.equal(clock.nextAt(), 1200)
  clock.advance(1000)
  assert.deepEqual(beats, [0, 1200])
})

test('tempo is bounded and invalid input is ignored', () => {
  const { metronome } = setup()
  assert.equal(metronome.setBpm(0), 50)
  assert.equal(metronome.setBpm(999), 250)
  assert.equal(metronome.setBpm(123.4), 123)
  for (const value of [NaN, Infinity, -Infinity, '120', null, undefined]) {
    assert.equal(metronome.setBpm(value), 123)
  }
})

test('pressing beyond a tempo limit does not delay the next beat', () => {
  const { clock, metronome } = setup(250)
  metronome.start()
  const deadline = clock.nextAt()
  clock.advance(100)
  metronome.setBpm(255)
  assert.equal(clock.nextAt(), deadline)
  assert.equal(clock.pending(), 1)
})

test('fractional intervals do not accumulate rounding drift over ten minutes', () => {
  const { clock, beats, metronome } = setup(180)
  metronome.start()
  clock.advance(600000)
  assert.ok(beats.length >= 1800)
  for (let i = 0; i < beats.length; i++) {
    assert.ok(Math.abs(beats[i] - i * 60000 / 180) <= 1.01)
  }
})

test('page starts a long downbeat and a 100 ms flash, then releases all resources', () => {
  const { page, clock, calls } = pageHarness()
  page.toggleRunning()
  assert.equal(page.running, true)
  assert.equal(page.lit, true)
  assert.deepEqual(calls.vibrations, ['long'])
  assert.deepEqual(calls.keepScreenOn, [true])
  clock.advance(100)
  assert.equal(page.lit, false)
  page.toggleRunning()
  assert.equal(clock.pending(), 0)
  assert.equal(page.running, false)
  assert.deepEqual(calls.keepScreenOn, [true, false])
})

for (const hook of ['onHide', 'onDestroy']) {
  test(`${hook} stops both timers and clears the active flash`, () => {
    const { page, clock, calls } = pageHarness()
    page.toggleRunning()
    page[hook]()
    page.onDestroy()
    assert.equal(clock.pending(), 0)
    assert.equal(page.lit, false)
    assert.equal(page.running, false)
    clock.advance(5000)
    assert.equal(calls.vibrations.length, 1)
    assert.deepEqual(calls.keepScreenOn, [true, false])
  })
}

test('vibration and flash preferences work independently', () => {
  for (const vibration of [true, false]) {
    for (const flash of [true, false]) {
      const { page, clock, calls } = pageHarness({ preferences: { vibration, flash } })
      page.toggleRunning()
      assert.equal(calls.vibrations.length, vibration ? 1 : 0)
      assert.equal(page.lit, flash)
      clock.advance(500)
      assert.equal(calls.vibrations.length, vibration ? 2 : 0)
      assert.equal(page.lit, flash)
      page.stop()
      assert.equal(clock.pending(), 0)
    }
  }
})

test('unsupported keep-screen-on reports a warning without crashing', () => {
  const { page, clock } = pageHarness({ keepScreenFails: true })
  page.toggleRunning()
  assert.equal(page.status, 'Keep-screen-on unavailable')
  assert.equal(page.running, true)
  page.onHide()
  assert.equal(clock.pending(), 0)
})

test('a throwing vibration API disables vibration and leaves visual timing usable', () => {
  const { page, clock } = pageHarness({ vibrationFails: true })
  page.toggleRunning()
  assert.equal(page.status, 'Vibration unavailable')
  assert.equal(page.vibration, false)
  clock.advance(500)
  assert.equal(page.running, true)
  assert.equal(page.lit, true)
})
