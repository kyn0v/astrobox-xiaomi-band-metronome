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
  assert.equal(tempo.pickerEntries.map(e => e.options[e.selected]).join(''), String(bpm).padStart(3, '0'))
}

test('native selections with unchanged ranges never feed back selected or rebuild the wheels', () => {
  const h = setup({ deferSaves: true })
  const entries = h.tempo.pickerEntries
  choose(h.tempo, 1, 7)
  h.finishSave()
  choose(h.tempo, 2, 3)
  assert.equal(h.tempo.bpm, 173)
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(entries[1].selected, 2)
  assert.equal(entries[2].selected, 0)
  h.finishSave(false)
  h.tempo.retrySave()
  h.finishSave()
  h.tempo.onHide()
  h.tempo.onShow()
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(h.stored().bpm, 173)
})

test('tens and ones callbacks compose in either order without resetting the sibling', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const h = setup()
    const entries = h.tempo.pickerEntries
    for (const column of order) choose(h.tempo, column, column === 1 ? 6 : 5)
    assert.equal(h.tempo.bpm, 165)
    assert.equal(h.stored().bpm, 165)
    assert.equal(h.tempo.pickerEntries, entries)
  }
})

test('Tap Tempo replaces only changed columns and ignores discarded-wheel callbacks', () => {
  const h = setup()
  const previous = h.tempo.pickerEntries
  choose(h.tempo, 1, 7)
  choose(h.tempo, 2, 3)
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(500)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 120)
  assertInitialSelection(h.tempo, 120)
  assert.equal(h.tempo.pickerEntries[0], previous[0])
  for (let i = 1; i < 3; i++) {
    assert.notEqual(h.tempo.pickerEntries[i].id, previous[i].id)
    h.tempo.onNativePickerChange(previous[i].id, { newValue: i === 1 ? '7' : '3' })
  }
  assert.equal(h.tempo.bpm, 120)
  const entries = h.tempo.pickerEntries
  for (const [i, value] of ['1', '2', '0'].entries()) choose(h.tempo, i, value)
  h.clock.advance(500)
  h.tempo.tapTempo()
  assert.equal(h.tempo.pickerEntries, entries)
  assert.equal(h.tempo.tapHint, 'Tempo detected: 120')
})

test('external changes replace only columns with a changed digit or range', () => {
  const h = setup({ preferences: { bpm: 165 } })
  let entries = h.tempo.pickerEntries
  h.tempo.setTempo(175, true)
  assert.equal(h.tempo.pickerEntries[0], entries[0])
  assert.notEqual(h.tempo.pickerEntries[1], entries[1])
  assert.equal(h.tempo.pickerEntries[2], entries[2])
  entries = h.tempo.pickerEntries
  h.tempo.setTempo(179, true)
  assert.equal(h.tempo.pickerEntries[1], entries[1])
  assert.notEqual(h.tempo.pickerEntries[2], entries[2])
  for (const bpm of [250, 240, 250, 50, 99, 100, 199, 200]) {
    h.tempo.setTempo(bpm, true)
    assertInitialSelection(h.tempo, bpm)
  }
})

test('hundreds changes invalidate old tens events even when the previous digit is still legal', () => {
  const h = setup({ preferences: { bpm: 123 } })
  const oldTens = h.tempo.pickerEntries[1]
  choose(h.tempo, 0, 0)
  assert.equal(h.tempo.bpm, 53)
  h.tempo.onNativePickerChange(oldTens.id, { newValue: '8' })
  assert.equal(h.tempo.bpm, 53)
  choose(h.tempo, 1, 8)
  assert.equal(h.tempo.bpm, 83)
})

test('warm/cold initialization and hidden updates set all digits before showing', () => {
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
  }
})

test('unchanged tempo, unrelated preferences and returning do not rebuild the wheels', () => {
  const h = setup()
  const entries = h.tempo.pickerEntries
  h.page._store.update({ theme: 'violet', flash: false })
  h.tempo.setTempo(120, true)
  choose(h.tempo, 1, 6)
  choose(h.tempo, 2, 5)
  h.tempo.onHide()
  h.page.onShow()
  assert.equal(h.page.bpm, 165)
  h.page.onHide()
  h.tempo.onShow()
  assert.equal(h.tempo.bpm, 165)
  assert.equal(h.tempo.pickerEntries, entries)
})

test('three equal-width wheels retain native sizing without duplicate labels or status lines', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/tempo/index.ux'), 'utf8')
  const template = source.split('<script>')[0]
  for (const selector of ['tempo-picker', 'tempo-value', 'wheels']) {
    const style = source.match(new RegExp('\\.' + selector + ' \\{([^}]+)\\}'))[1]
    assert.doesNotMatch(style, /(?:^|;)\s*(?:height|min-height|max-height)\s*:/)
    assert.match(style, /flex-shrink: 0/)
  }
  const style = source.match(/\.tempo-picker \{([^}]+)\}/)[1]
  assert.match(style, /width: 84px/)
  assert.equal(style.match(/(?:^|;)\s*font-size:\s*(\d+px)/)[1], style.match(/selected-font-size:\s*(\d+px)/)[1])
  assert.match(template, /for="\{\{ pickerEntries \}\}" tid="id"/)
  assert.match(template, /<text class="unit">BPM<\/text>/)
  assert.doesNotMatch(template, /wheel-heading|tap-guide|\{\{ bpm \}\}|quarterUnit|dottedUnit/)
  assert.equal((template.match(/onclick="retrySave"/g) || []).length, 1)
})

test('single hint follows meter and alternates between guidance, tap progress and result', () => {
  const h = setup()
  assert.equal(h.tempo.tapHint, 'Tap along with the beat')
  h.tempo.tapTempo()
  assert.equal(h.tempo.tapHint, 'Taps: 1/4')
  h.page._store.update({ meter: '6/8' })
  assert.equal(h.tempo.tapHint, 'Tap the two main beats')
  assert.equal(h.clock.pending(), 0)
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(1000)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.tapHint, 'Tempo detected: 60')
  h.tempo.resetTap()
  assert.equal(h.tempo.tapHint, 'Tap the two main beats')
})
