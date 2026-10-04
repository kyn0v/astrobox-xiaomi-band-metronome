const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')

function setup(options) {
  const h = pageHarness(options)
  h.page.onHide()
  return { ...h, tempo: h.createPage('tempo') }
}

test('wheel-originated changes never write back selected or recreate the native picker', () => {
  const h = setup({ deferSaves: true })
  const entries = h.tempo.pickerEntries
  const entry = entries[0]
  h.tempo.onNativePickerChange(entry.id, { newValue: '173', newSelected: 123 })
  assert.equal(h.tempo.bpm, 173)
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(entry.selected, 70) // Initial prop stays untouched; native wheel owns current selection.
  h.finishSave(false)
  h.tempo.retrySave()
  h.finishSave()
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(h.stored().bpm, 173)
  h.tempo.onHide()
  h.tempo.onShow()
  assert.equal(h.tempo.pickerEntries, entries)
})

test('newValue is authoritative as in the official example, even when the index differs or is missing', () => {
  const h = setup()
  for (const event of [{ newValue: '173' }, { newValue: '174', newSelected: '124' },
    { newValue: '175', newSelected: 999 }, { newValue: 176 }]) {
    h.tempo.onPickerChange(event)
    assert.equal(h.tempo.bpm, Number(event.newValue))
    assert.equal(h.stored().bpm, Number(event.newValue))
  }
  h.tempo.onPickerChange({ newSelected: 77 })
  assert.equal(h.tempo.bpm, 127)
})

test('bad selected values are rejected rather than replaced by an unrelated valid index', () => {
  const h = setup()
  for (const newValue of ['', '1e2', '123.5', 'text', null, {}, [], 49, 251, Infinity, NaN]) {
    h.tempo.onPickerChange({ newValue, newSelected: 10 })
  }
  assert.equal(h.tempo.bpm, 120)
  assert.equal(h.calls.writes.length, 0)
})

test('Tap Tempo recreates exactly one picker at the calculated value, including a return to its initial value', () => {
  const h = setup()
  const oldId = h.tempo.pickerEntries[0].id
  h.tempo.onNativePickerChange(oldId, { newValue: '173' })
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(500)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 120)
  assert.equal(h.tempo.tapHint, 'Tempo detected: 120')
  assert.equal(h.tempo.pickerEntries.length, 1)
  const entry = h.tempo.pickerEntries[0]
  assert.notEqual(entry.id, oldId)
  assert.equal(entry.selected, 70)
  assert.equal(h.tempo.bpmOptions[entry.selected], '120')
  h.tempo.onNativePickerChange(oldId, { newValue: '173' }) // Late event from the discarded wheel.
  assert.equal(h.tempo.bpm, 120)
  const writes = h.calls.writes.length
  h.tempo.onNativePickerChange(entry.id, { newValue: '120' })
  h.clock.advance(500)
  h.tempo.tapTempo()
  assert.equal(h.tempo.pickerEntries[0], entry)
  assert.equal(h.tempo.tapHint, 'Tempo detected: 120')
  assert.equal(h.calls.writes.length, writes)
})

test('warm/cold initialization and external updates mount at the saved value before showing', () => {
  for (const deferLoad of [false, true]) {
    const h = setup({ preferences: { bpm: 211 }, deferLoad })
    if (deferLoad) h.finishLoad()
    assert.equal(h.tempo.pickerEntries[0].selected, 161)
    h.tempo.onHide()
    h.page._store.update({ bpm: 87 })
    assert.equal(h.tempo.pickerEntries[0].selected, 37)
    const entry = h.tempo.pickerEntries[0]
    h.tempo.onShow()
    assert.equal(h.tempo.pickerEntries[0], entry)
    assert.equal(h.tempo.bpm, 87)
  }
})

test('unchanged tempo and unrelated preferences do not rebuild the wheel', () => {
  const h = setup()
  const entries = h.tempo.pickerEntries
  h.page._store.update({ theme: 'violet', flash: false })
  assert.equal(h.tempo.pickerEntries, entries)
  h.tempo.setTempo(120, true)
  assert.equal(h.tempo.pickerEntries, entries)
})

test('picker uses intrinsic height and official example font sizes rather than a clipped fixed viewport', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/tempo/index.ux'), 'utf8')
  const style = source.match(/\.tempo-picker \{([^}]+)\}/)[1]
  assert.doesNotMatch(style, /(?:^|;)\s*(?:height|min-height|max-height)\s*:/)
  assert.match(style, /font-size: 25px/)
  assert.match(style, /selected-font-size: 30px/)
  assert.match(source, /for="\{\{ pickerEntries \}\}" tid="id"/)
})
