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
function choose(tempo, column, value) {
  tempo.onNativePickerChange(tempo.pickerEntries[column].id, { newValue: String(value) })
}
function assertInitialSelection(tempo, bpm) {
  const [tens, ones] = tempo.pickerEntries
  assert.equal(Number(tens.options[tens.selected]), Math.floor(bpm / 10) * 10)
  assert.equal(Number(ones.options[ones.selected]), bpm % 10)
}

test('wheel-originated changes never write back selected or recreate either unchanged-range wheel', () => {
  const h = setup({ deferSaves: true })
  const entries = h.tempo.pickerEntries
  choose(h.tempo, 0, 170)
  h.finishSave()
  choose(h.tempo, 1, 3)
  assert.equal(h.tempo.bpm, 173)
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(entries[0].selected, 7)
  assert.equal(entries[1].selected, 0)
  h.finishSave(false)
  h.tempo.retrySave()
  h.finishSave()
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(h.stored().bpm, 173)
  h.tempo.onHide()
  h.tempo.onShow()
  assert.equal(h.tempo.pickerEntries, entries)
})

test('callbacks from both columns compose in either order without stale sibling resets', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const h = setup()
    const entries = h.tempo.pickerEntries
    for (const column of order) choose(h.tempo, column, column === 0 ? 160 : 5)
    assert.equal(h.tempo.bpm, 165)
    assert.equal(h.stored().bpm, 165)
    assert.equal(h.tempo.pickerEntries, entries)
  }
})

test('Tap Tempo replaces changed columns and discards callbacks from the old wheels', () => {
  const h = setup()
  const previous = h.tempo.pickerEntries
  choose(h.tempo, 0, 170)
  choose(h.tempo, 1, 3)
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(500)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 120)
  assert.equal(h.tempo.tapHint, 'Tempo detected: 120')
  assertInitialSelection(h.tempo, 120)
  for (let column = 0; column < 2; column++) {
    assert.notEqual(h.tempo.pickerEntries[column].id, previous[column].id)
    h.tempo.onNativePickerChange(previous[column].id, { newValue: column === 0 ? '170' : '3' })
  }
  assert.equal(h.tempo.bpm, 120)
  const entries = h.tempo.pickerEntries
  choose(h.tempo, 0, 120)
  choose(h.tempo, 1, 0)
  h.clock.advance(500)
  h.tempo.tapTempo()
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(h.tempo.tapHint, 'Tempo detected: 120')
})

test('external changes replace only affected columns, including entering and leaving 250', () => {
  const h = setup({ preferences: { bpm: 165 } })
  let entries = h.tempo.pickerEntries
  h.tempo.setTempo(175, true)
  assert.notEqual(h.tempo.pickerEntries[0], entries[0])
  assert.equal(h.tempo.pickerEntries[1], entries[1])
  entries = h.tempo.pickerEntries
  h.tempo.setTempo(179, true)
  assert.equal(h.tempo.pickerEntries[0], entries[0])
  assert.notEqual(h.tempo.pickerEntries[1], entries[1])
  for (const bpm of [250, 240, 250, 50]) {
    h.tempo.setTempo(bpm, true)
    assertInitialSelection(h.tempo, bpm)
    assert.equal(h.tempo.pickerEntries[1].options.length, bpm === 250 ? 1 : 10)
  }
})

test('warm/cold initialization and hidden updates mount at the saved value before showing', () => {
  for (const deferLoad of [false, true]) {
    const h = setup({ preferences: { bpm: 211 }, deferLoad })
    if (deferLoad) h.finishLoad()
    assertInitialSelection(h.tempo, 211)
    h.tempo.onHide()
    h.page._store.update({ bpm: 87 })
    assertInitialSelection(h.tempo, 87)
    const entries = h.tempo.pickerEntries
    h.tempo.onShow()
    assert.equal(h.tempo.pickerEntries, entries)
    assert.equal(h.tempo.bpm, 87)
  }
})

test('unchanged tempo and unrelated preferences do not rebuild either wheel', () => {
  const h = setup()
  const entries = h.tempo.pickerEntries
  h.page._store.update({ theme: 'violet', flash: false })
  assert.equal(h.tempo.pickerEntries, entries)
  h.tempo.setTempo(120, true)
  assert.equal(h.tempo.pickerEntries, entries)
})

test('short wheels use side-by-side flow, intrinsic height and equal text metrics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/tempo/index.ux'), 'utf8')
  for (const selector of ['tempo-picker', 'tempo-value', 'wheels']) {
    const style = source.match(new RegExp('\\.' + selector + ' \\{([^}]+)\\}'))[1]
    assert.doesNotMatch(style, /(?:^|;)\s*(?:height|min-height|max-height)\s*:/)
    assert.match(style, /flex-shrink: 0/)
  }
  assert.match(source, /\.wheels \{[^}]*flex-direction: row/)
  const style = source.match(/\.tempo-picker \{([^}]+)\}/)[1]
  assert.match(style, /width: 126px/)
  assert.equal(style.match(/(?:^|;)\s*font-size:\s*(\d+px)/)[1], style.match(/selected-font-size:\s*(\d+px)/)[1])
  assert.match(source, /for="\{\{ pickerEntries \}\}" tid="id"/)
  assert.match(source, /range="\{\{ \$item.options \}\}"/)
  assert.match(source, /labels.tempoTens/)
  assert.match(source, /labels.tempoOnes/)
})

test('unit label exposes combined BPM and returning home preserves it', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/tempo/index.ux'), 'utf8')
  assert.match(source, /<text class="unit">\{\{ bpm \}\}/)
  const h = setup({ preferences: { bpm: 181 } })
  const entries = h.tempo.pickerEntries
  for (const bpm of [158, 159, 160, 153, 154, 165]) {
    choose(h.tempo, 0, Math.floor(bpm / 10) * 10)
    choose(h.tempo, 1, bpm % 10)
    assert.equal(h.tempo.bpm, bpm)
    assert.equal(h.stored().bpm, bpm)
    assert.equal(h.tempo.pickerEntries, entries)
  }
  h.tempo.onHide()
  h.page.onShow()
  assert.equal(h.page.bpm, 165)
  h.page.onHide()
  h.tempo.onShow()
  assert.equal(h.tempo.bpm, 165)
})
