const test = require('node:test')
const assert = require('node:assert/strict')
const { pageHarness } = require('./helpers.cjs')

function tempoPage(options) {
  const h = pageHarness(options)
  h.page.onHide()
  return { ...h, tempo: h.createPage('tempo') }
}

test('wheel offers every integer BPM from 50 to 250 and restores the saved selection', () => {
  const { tempo, calls } = tempoPage({ preferences: { bpm: 173 } })
  assert.equal(tempo.bpmOptions.length, 201)
  assert.equal(tempo.minBpm, 50)
  for (let i = 0; i <= 200; i++) assert.equal(tempo.bpmOptions[i], String(50 + i))
  assert.equal(tempo.bpmOptions[tempo.bpm - tempo.minBpm], '173')
  assert.equal(calls.writes.length, 0)
  assert.equal(tempo.previewBpm, undefined)
  assert.equal(tempo._slider, undefined)
})

test('wheel saves confirmed values once, including both endpoints', () => {
  const h = tempoPage()
  for (const [index, bpm] of [[0, 50], [200, 250], [87, 137]]) {
    const writes = h.calls.writes.length
    h.tempo.onPickerChange({ newSelected: index, newValue: String(bpm) })
    h.tempo.onPickerChange({ newSelected: index, newValue: String(bpm) })
    assert.equal(h.tempo.bpm, bpm)
    assert.equal(h.stored().bpm, bpm)
    assert.equal(h.calls.writes.length, writes + 1)
  }
})

test('programmatic selection echoes after Tap Tempo do not reset the tap sequence', () => {
  const h = tempoPage({ preferences: { meter: '6/8' } })
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(1000)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 60)
  assert.equal(h.tempo.bpmOptions[h.tempo.bpm - h.tempo.minBpm], '60')
  const writes = h.calls.writes.length
  h.tempo.onPickerChange({ newSelected: 10, newValue: '60' })
  h.clock.advance(1000)
  h.tempo.tapTempo()
  assert.equal(h.tempo.tapHint, 'Tempo detected: 60')
  assert.equal(h.calls.writes.length, writes)
  assert.deepEqual(h.calls.vibrations, [])
})

test('selection echoes do not automatically retry a failed save; explicit error retry still works', () => {
  const h = tempoPage({ deferSaves: true })
  h.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  h.finishSave(false)
  h.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  assert.equal(h.pendingSaves(), 0)
  assert.equal(h.tempo.warning, true)
  h.tempo.retrySave()
  assert.equal(h.pendingSaves(), 1)
  h.finishSave()
  assert.equal(h.stored().bpm, 173)
})

test('invalid, hidden, loading, and post-navigation picker events do not write preferences', () => {
  const h = tempoPage()
  for (const event of [null, {}, { newSelected: -1 }, { newSelected: 201 }, { newSelected: 2.5 },
    { newSelected: '30' }, { newSelected: Infinity }, { newSelected: 100, newValue: '151' }]) {
    h.tempo.onPickerChange(event)
  }
  h.tempo.onHide()
  h.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  h.tempo.onShow()
  h.tempo.goBack()
  h.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  assert.equal(h.calls.writes.length, 0)
  const cold = tempoPage({ deferLoad: true })
  cold.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  assert.equal(cold.calls.writes.length, 0)
})

test('scrolling the wheel cancels tap sampling, does not navigate, and does not persist raw movement', () => {
  const h = tempoPage()
  h.tempo.tapTempo()
  const touch = (x, y) => ({ identifier: 0, clientX: x, clientY: y })
  h.tempo.onPickerTouchStart()
  h.tempo.onPageTouchStart({ touches: [touch(100, 220)] })
  h.tempo.onPageTouchMove({ touches: [touch(170, 90)] })
  assert.equal(h.calls.writes.length, 0)
  h.tempo.onPageTouchEnd({ touches: [], changedTouches: [touch(170, 90)] })
  h.tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  h.tempo.tapTempo() // Ignore a stray click delivered immediately after scrolling.
  assert.deepEqual(h.calls.routes, [])
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.calls.writes.length, 1)
  assert.equal(h.stored().bpm, 173)
})
