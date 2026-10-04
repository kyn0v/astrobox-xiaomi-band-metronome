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
  return Number(tempo.pickerEntries.map(entry => entry.options[entry.selected]).join(''))
}

test('three short wheels initialize every BPM exactly, including a leading zero below 100', () => {
  for (let bpm = 50; bpm <= 250; bpm++) {
    const { tempo, calls } = setup({ preferences: { bpm } })
    assert.equal(tempo.pickerEntries.length, 3)
    assert.equal(tempo.pickerEntries[0].options.length, 3)
    assert.equal(tempo.pickerEntries[1].options.length, bpm < 100 ? 5 : bpm < 200 ? 10 : 6)
    assert.equal(tempo.pickerEntries[2].options.length, bpm === 250 ? 1 : 10)
    assert.equal(selectedBpm(tempo), bpm)
    assert.equal(tempo.pickerEntries[0].options[tempo.pickerEntries[0].selected], String(Math.floor(bpm / 100)))
    assert.equal(calls.writes.length, 0)
  }
})

test('each offered digit yields a legal saved value and preserves the emitting digit', () => {
  for (let bpm = 50; bpm <= 250; bpm++) {
    for (let column = 0; column < 3; column++) {
      const baseline = setup({ preferences: { bpm } })
      const options = Array.from(baseline.tempo.pickerEntries[column].options)
      for (let index = 0; index < options.length; index++) {
        const h = setup({ preferences: { bpm } })
        choose(h.tempo, column, { newSelected: index })
        assert.ok(h.tempo.bpm >= 50 && h.tempo.bpm <= 250)
        assert.equal(String(h.tempo.bpm).padStart(3, '0')[column], options[index])
        assert.equal(h.stored().bpm, h.tempo.bpm)
        const writes = h.calls.writes.length
        choose(h.tempo, column, { newValue: options[index] })
        assert.equal(h.calls.writes.length, writes)
      }
    }
  }
})

test('hundreds changes preserve ones and adjust tens: 199 -> 249 and 123 -> 053', () => {
  for (const [start, hundreds, expected] of [[199, 2, 249], [123, 0, 53], [150, 2, 250], [250, 0, 50]]) {
    const h = setup({ preferences: { bpm: start } })
    const emitter = h.tempo.pickerEntries[0]
    choose(h.tempo, 0, { newValue: String(hundreds) })
    assert.equal(h.tempo.bpm, expected)
    assert.equal(h.tempo.pickerEntries[0], emitter)
    for (let i = 1; i < 3; i++) {
      const entry = h.tempo.pickerEntries[i]
      assert.equal(entry.options[entry.selected], String(expected).padStart(3, '0')[i])
    }
  }
})

test('249 -> 250 locks ones; 250 -> 240 restores them; stale events cannot revive old values', () => {
  const h = setup({ preferences: { bpm: 249 } })
  const oldOnes = h.tempo.pickerEntries[2]
  const tens = h.tempo.pickerEntries[1]
  choose(h.tempo, 1, { newValue: '5' })
  assert.equal(h.tempo.bpm, 250)
  assert.equal(h.tempo.pickerEntries[1], tens)
  const locked = h.tempo.pickerEntries[2]
  assert.deepEqual(Array.from(locked.options), ['0'])
  h.tempo.onNativePickerChange(oldOnes.id, { newValue: '9' })
  choose(h.tempo, 2, { newValue: '9' })
  assert.equal(h.tempo.bpm, 250)
  choose(h.tempo, 1, { newValue: '4' })
  assert.equal(h.tempo.bpm, 240)
  assert.equal(h.tempo.pickerEntries[2].options.length, 10)
  choose(h.tempo, 2, { newValue: '9' })
  h.tempo.onNativePickerChange(locked.id, { newValue: '0' })
  assert.equal(h.tempo.bpm, 249)
})

test('newValue is primary; values outside the current digit range are rejected', () => {
  const h = setup({ preferences: { bpm: 173 } })
  choose(h.tempo, 1, { newValue: '6', newSelected: 999 })
  assert.equal(h.tempo.bpm, 163)
  for (const value of ['', '1e2', '1.5', 'text', null, {}, [], Infinity, NaN, -1, 10, 170]) {
    for (let i = 0; i < 3; i++) choose(h.tempo, i, { newValue: value, newSelected: 0 })
  }
  assert.equal(h.tempo.bpm, 163)
  choose(h.tempo, 0, { newValue: '0' })
  choose(h.tempo, 1, { newValue: '4' })
  assert.equal(h.tempo.bpm, 63)
  choose(h.tempo, 0, { newValue: '2' })
  choose(h.tempo, 1, { newValue: '6' })
  assert.equal(h.tempo.bpm, 243)
})

test('programmatic echoes after Tap Tempo do not reset the tap sequence', () => {
  const h = setup({ preferences: { meter: '6/8', bpm: 173 } })
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(1000)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 60)
  assert.equal(selectedBpm(h.tempo), 60)
  const writes = h.calls.writes.length
  for (const [i, digit] of ['0', '6', '0'].entries()) choose(h.tempo, i, { newValue: digit })
  h.clock.advance(1000)
  h.tempo.tapTempo()
  assert.equal(h.tempo.tapHint, 'Tempo detected: 60')
  assert.equal(h.calls.writes.length, writes)
})

test('echoes do not retry a failed save; explicit error retry still works', () => {
  const h = setup({ deferSaves: true })
  choose(h.tempo, 2, { newValue: '3' })
  h.finishSave(false)
  choose(h.tempo, 2, { newValue: '3' })
  assert.equal(h.pendingSaves(), 0)
  assert.equal(h.tempo.warning, true)
  h.tempo.retrySave()
  h.finishSave()
  assert.equal(h.stored().bpm, 123)
})

test('invalid, hidden, loading, and post-navigation events cannot change preferences', () => {
  const h = setup()
  for (let column = 0; column < 3; column++) {
    for (const event of [null, {}, { newSelected: -1 }, { newSelected: 10 }, { newSelected: 2.5 },
      { newSelected: '3' }, { newSelected: Infinity }, { newValue: 'invalid' }]) choose(h.tempo, column, event)
  }
  h.tempo.onHide()
  choose(h.tempo, 2, { newValue: '3' })
  h.tempo.onShow()
  h.tempo.goBack()
  choose(h.tempo, 1, { newValue: '7' })
  assert.equal(h.calls.writes.length, 0)
  const cold = setup({ deferLoad: true })
  choose(cold.tempo, 2, { newValue: '3' })
  assert.equal(cold.calls.writes.length, 0)
})

test('touches from all three wheels exclude navigation and cancel taps without saving movement', () => {
  for (let column = 0; column < 3; column++) {
    const h = setup()
    h.tempo.tapTempo()
    const touch = (x, y) => ({ identifier: 0, clientX: x, clientY: y })
    h.tempo.onPickerTouchStart()
    h.tempo.onPageTouchStart({ touches: [touch(100, 220)] })
    h.tempo.onPageTouchMove({ touches: [touch(170, 90)] })
    assert.equal(h.calls.writes.length, 0)
    h.tempo.onPageTouchEnd({ touches: [], changedTouches: [touch(170, 90)] })
    choose(h.tempo, column, { newValue: ['2', '7', '3'][column] })
    h.tempo.tapTempo()
    assert.deepEqual(h.calls.routes, [])
    assert.equal(h.clock.pending(), 0)
    assert.equal(h.calls.writes.length, 1)
    assert.equal(h.stored().bpm, [220, 170, 123][column])
  }
})
