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
  assert.equal(h.tempo.bpm, 120)
  assert.equal(h.tempo.notice, '')
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

test('clamping replaces adjusted digits and rejects their old callbacks', () => {
  const h = setup({ preferences: { bpm: 123 } })
  const oldTens = h.tempo.pickerEntries[1]
  choose(h.tempo, 0, 0)
  assert.equal(h.tempo.bpm, 50)
  h.tempo.onNativePickerChange(oldTens.id, { newValue: '8' })
  assert.equal(h.tempo.bpm, 50)
  choose(h.tempo, 1, 8)
  assert.equal(h.tempo.bpm, 80)
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
  assert.match(style, /width: 64px/)
  assert.match(style, /font-size: 36px/)
  assert.match(style, /font-weight: bold/)
  assert.equal(style.match(/(?:^|;)\s*font-size:\s*(\d+px)/)[1], style.match(/selected-font-size:\s*(\d+px)/)[1])
  assert.match(template, /for="\{\{ pickerEntries \}\}" tid="id"/)
  assert.match(template, /class="unit" onclick="retrySave"/)
  assert.match(template, /warning \? status : notice \|\| 'BPM'/)
  const readyContent = template.slice(template.indexOf('<div class="content"'))
  assert.doesNotMatch(readyContent, /class="hint"|tapHint|tap-guide/)
  assert.doesNotMatch(template, /wheel-heading|\{\{ bpm \}\}|quarterUnit|dottedUnit/)
  assert.equal((template.match(/onclick="retrySave"/g) || []).length, 1)
})

test('range notices expire, are replaced by newer notices, and clear on leaving', () => {
  const h = setup()
  choose(h.tempo, 0, 9)
  assert.equal(h.tempo.notice, 'Maximum: 250 BPM')
  h.clock.advance(1000)
  choose(h.tempo, 0, 0)
  choose(h.tempo, 1, 0)
  assert.equal(h.tempo.notice, 'Minimum: 50 BPM')
  h.clock.advance(800)
  assert.equal(h.tempo.notice, 'Minimum: 50 BPM')
  h.clock.advance(1000)
  assert.equal(h.tempo.notice, '')
  assert.equal(h.clock.pending(), 0)
  for (const action of ['onHide', 'onBackPress', 'goBack', 'onDestroy']) {
    const other = setup()
    choose(other.tempo, 0, 9)
    other.tempo[action]()
    assert.equal(other.tempo.notice, '')
    assert.equal(other.clock.pending(), 0)
  }
})

test('tap feedback is visual only; a meter change still resets sampling', () => {
  const h = setup()
  h.tempo.tapTempo()
  assert.equal(h.tempo.tapLit, true)
  assert.equal(h.tempo.notice, '')
  assert.equal(h.tempo.tapHint, undefined)
  h.clock.advance(100)
  assert.equal(h.tempo.tapLit, false)
  h.page._store.update({ meter: '6/8' })
  assert.equal(h.clock.pending(), 0)
})
