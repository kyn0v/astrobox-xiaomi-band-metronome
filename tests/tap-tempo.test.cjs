const test = require('node:test')
const assert = require('node:assert/strict')
const { createTapTempo, TAP_TIMEOUT_MS } = require('../src/common/tap-tempo')

function tapSequence(times) {
  const taps = createTapTempo()
  return times.map(time => taps.tap(time))
}

test('four regular taps detect 120 BPM; earlier taps do not change tempo', () => {
  const results = tapSequence([0, 500, 1000, 1500])
  assert.deepEqual(results.map(r => r.bpm), [null, null, null, 120])
  assert.deepEqual(results.map(r => r.count), [1, 2, 3, 4])
})

test('double taps do not displace the timing reference', () => {
  const results = tapSequence([0, 100, 500, 1000, 1500])
  assert.equal(results[1].count, 1)
  assert.equal(results.at(-1).bpm, 120)
})

test('small variation is averaged and a large outlier is excluded', () => {
  assert.equal(tapSequence([0, 499, 1000, 1498]).at(-1).bpm, 120)
  const results = tapSequence([0, 500, 1000, 2000, 2500])
  assert.equal(results[3].bpm, null)
  assert.equal(results[4].bpm, 120)
})

test('a pause or backwards clock resets the tap sequence', () => {
  const taps = createTapTempo()
  taps.tap(0)
  taps.tap(500)
  assert.equal(taps.tap(500 + TAP_TIMEOUT_MS).count, 1)
  assert.equal(taps.tap(1000).count, 1)
  taps.reset()
  assert.equal(taps.tap(1500).count, 1)
})

test('out-of-range tempo is reported rather than silently clamped', () => {
  for (const interval of [220, 1300]) {
    const result = tapSequence([0, interval, interval * 2, interval * 3]).at(-1)
    assert.equal(result.bpm, null)
    assert.equal(result.outOfRange, true)
  }
  assert.equal(tapSequence([0, 1200, 2400, 3600]).at(-1).bpm, 50)
  assert.equal(tapSequence([0, 240, 480, 720]).at(-1).bpm, 250)
})

test('recent taps replace old tempo history', () => {
  const times = [0, 500, 1000, 1500]
  for (let i = 1; i <= 7; i++) times.push(1500 + 400 * i)
  assert.equal(tapSequence(times).at(-1).bpm, 150)
})

test('invalid timestamps do not poison subsequent taps', () => {
  const taps = createTapTempo()
  for (const value of [NaN, Infinity, undefined, '500']) {
    assert.equal(taps.tap(value).count, 0)
  }
  for (const time of [0, 500, 1000]) taps.tap(time)
  assert.equal(taps.tap(1500).bpm, 120)
})
