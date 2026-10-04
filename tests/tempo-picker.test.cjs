const test = require('node:test')
const assert = require('node:assert/strict')
const { pageHarness } = require('./helpers.cjs')

function setup(options) {
  const h = pageHarness(options)
  h.page.onHide()
  return { ...h, tempo: h.createPage('tempo') }
}
function choose(tempo, column, event) {
  tempo.onNativePickerChange(tempo.pickerEntries[column].id, event)
}
function selectedBpm(tempo) {
  return tempo.pickerEntries.reduce((sum, entry) => sum + Number(entry.options[entry.selected]), 0)
}

test('two short wheels initialize every BPM from 50 through 250 exactly', () => {
  for (let bpm = 50; bpm <= 250; bpm++) {
    const { tempo, calls } = setup({ preferences: { bpm } })
    assert.equal(tempo.pickerEntries.length, 2)
    assert.equal(tempo.pickerEntries[0].options.length, 21)
    assert.equal(tempo.pickerEntries[1].options.length, bpm === 250 ? 1 : 10)
    assert.equal(selectedBpm(tempo), bpm)
    assert.equal(calls.writes.length, 0)
  }
})

test('column index events compose every BPM and persist exactly once per changed selection', () => {
  const h = setup()
  for (let bpm = 50; bpm <= 250; bpm++) {
    choose(h.tempo, 0, { newSelected: Math.floor((bpm - 50) / 10) })
    choose(h.tempo, 1, { newSelected: bpm % 10 })
    assert.equal(h.tempo.bpm, bpm)
    assert.equal(h.stored().bpm, bpm)
    const writes = h.calls.writes.length
    choose(h.tempo, 1, { newValue: String(bpm % 10) })
    assert.equal(h.calls.writes.length, writes)
  }
})

test('250 resets and locks ones, leaving 250 restores ten choices without reviving old ones', () => {
  const h = setup({ preferences: { bpm: 249 } })
  const tens = h.tempo.pickerEntries[0]
  const oldOnes = h.tempo.pickerEntries[1]
  choose(h.tempo, 0, { newValue: '250' })
  assert.equal(h.tempo.bpm, 250)
  assert.equal(h.tempo.pickerEntries[0], tens)
  const locked = h.tempo.pickerEntries[1]
  assert.deepEqual(Array.from(locked.options), ['0'])
  assert.equal(locked.selected, 0)
  assert.notEqual(locked.id, oldOnes.id)
  h.tempo.onNativePickerChange(oldOnes.id, { newValue: '9' })
  choose(h.tempo, 1, { newValue: '9' })
  assert.equal(h.tempo.bpm, 250)
  choose(h.tempo, 0, { newValue: '50' })
  assert.equal(h.tempo.bpm, 50)
  assert.equal(h.tempo.pickerEntries[1].options.length, 10)
  h.tempo.onNativePickerChange(locked.id, { newValue: '0' })
  choose(h.tempo, 1, { newValue: '9' })
  assert.equal(h.tempo.bpm, 59)
  assert.equal(h.stored().bpm, 59)
})

test('newValue is primary; only values in the emitting column are accepted', () => {
  const h = setup()
  choose(h.tempo, 0, { newValue: '170', newSelected: 999 })
  choose(h.tempo, 1, { newValue: 3 })
  assert.equal(h.tempo.bpm, 173)
  for (const value of ['', '1e2', '123.5', 'text', null, {}, [], Infinity, NaN, -1, 251]) {
    choose(h.tempo, 0, { newValue: value, newSelected: 0 })
    choose(h.tempo, 1, { newValue: value, newSelected: 0 })
  }
  choose(h.tempo, 0, { newValue: '173' })
  choose(h.tempo, 1, { newValue: '170' })
  assert.equal(h.tempo.bpm, 173)
})

test('programmatic selection echoes after Tap Tempo do not reset the tap sequence', () => {
  const h = setup({ preferences: { meter: '6/8', bpm: 173 } })
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(1000)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 60)
  assert.equal(selectedBpm(h.tempo), 60)
  const writes = h.calls.writes.length
  choose(h.tempo, 0, { newValue: '60' })
  choose(h.tempo, 1, { newValue: '0' })
  h.clock.advance(1000)
  h.tempo.tapTempo()
  assert.equal(h.tempo.tapHint, 'Tempo detected: 60')
  assert.equal(h.calls.writes.length, writes)
  assert.deepEqual(h.calls.vibrations, [])
})

test('selection echoes do not retry a failed save; explicit error retry still works', () => {
  const h = setup({ deferSaves: true })
  choose(h.tempo, 1, { newValue: '3' })
  h.finishSave(false)
  choose(h.tempo, 1, { newValue: '3' })
  assert.equal(h.pendingSaves(), 0)
  assert.equal(h.tempo.warning, true)
  h.tempo.retrySave()
  assert.equal(h.pendingSaves(), 1)
  h.finishSave()
  assert.equal(h.stored().bpm, 123)
})

test('invalid, hidden, loading, and post-navigation picker events do not write preferences', () => {
  const h = setup()
  for (let column = 0; column < 2; column++) {
    for (const event of [null, {}, { newSelected: -1 }, { newSelected: 21 }, { newSelected: 2.5 },
      { newSelected: '3' }, { newSelected: Infinity }, { newValue: 'invalid' }]) choose(h.tempo, column, event)
  }
  h.tempo.onHide()
  choose(h.tempo, 1, { newValue: '3' })
  h.tempo.onShow()
  h.tempo.goBack()
  choose(h.tempo, 0, { newValue: '170' })
  assert.equal(h.calls.writes.length, 0)
  const cold = setup({ deferLoad: true })
  choose(cold.tempo, 1, { newValue: '3' })
  assert.equal(cold.calls.writes.length, 0)
})

test('scrolling either wheel cancels taps, excludes navigation, and does not save raw movement', () => {
  for (let column = 0; column < 2; column++) {
    const h = setup()
    h.tempo.tapTempo()
    const touch = (x, y) => ({ identifier: 0, clientX: x, clientY: y })
    h.tempo.onPickerTouchStart()
    h.tempo.onPageTouchStart({ touches: [touch(100, 220)] })
    h.tempo.onPageTouchMove({ touches: [touch(170, 90)] })
    assert.equal(h.calls.writes.length, 0)
    h.tempo.onPageTouchEnd({ touches: [], changedTouches: [touch(170, 90)] })
    choose(h.tempo, column, { newValue: column === 0 ? '170' : '3' })
    h.tempo.tapTempo()
    assert.deepEqual(h.calls.routes, [])
    assert.equal(h.clock.pending(), 0)
    assert.equal(h.calls.writes.length, 1)
    assert.equal(h.stored().bpm, column === 0 ? 170 : 123)
  }
})
