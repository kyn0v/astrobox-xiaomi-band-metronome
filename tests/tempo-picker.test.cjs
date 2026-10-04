const test = require('node:test')
const assert = require('node:assert/strict')
const { pageHarness } = require('./helpers.cjs')
function setup(options) {
  const h = pageHarness(options)
  h.page.onHide()
  return { ...h, tempo: h.createPage('tempo') }
}
function choose(t, column, event) { t.onNativePickerChange(t.pickerEntries[column].id, event) }
function initialBpm(t) { return Number(t.pickerEntries.map(e => e.options[e.selected]).join('')) }

test('every BPM initializes exactly with three unrestricted 0-9 wheels', () => {
  for (let bpm = 50; bpm <= 250; bpm++) {
    const h = setup({ preferences: { bpm } })
    assert.equal(h.tempo.pickerEntries.length, 3)
    for (const entry of h.tempo.pickerEntries) assert.equal(entry.options.join(''), '0123456789')
    assert.equal(initialBpm(h.tempo), bpm)
    assert.equal(h.calls.writes.length, 0)
  }
})

test('every digit choice clamps to 50-250 and resets exactly the necessary native selections', () => {
  for (let bpm = 50; bpm <= 250; bpm++) {
    const digits = String(bpm).padStart(3, '0').split('').map(Number)
    for (let column = 0; column < 3; column++) {
      for (let digit = 0; digit <= 9; digit++) {
        const h = setup({ preferences: { bpm } })
        const entries = h.tempo.pickerEntries
        const attempted = bpm + (digit - digits[column]) * [100, 10, 1][column]
        const expected = Math.max(50, Math.min(250, attempted))
        choose(h.tempo, column, { newSelected: digit })
        assert.equal(h.tempo.bpm, expected)
        assert.equal(h.stored().bpm, expected)
        // Retained wheels keep their native selection; replaced ones use selected.
        const visible = h.tempo.pickerEntries.map((entry, i) => entry === entries[i]
          ? String(i === column ? digit : digits[i]) : entry.options[entry.selected]).join('')
        assert.equal(visible, String(expected).padStart(3, '0'))
        assert.equal(h.tempo.notice, attempted < 50 ? 'Minimum: 50 BPM' : attempted > 250 ? 'Maximum: 250 BPM' : '')
      }
    }
  }
})

test('invalid choices at the existing boundary still reset the emitting wheel without writing', () => {
  for (const [bpm, column, digit] of [[50, 1, 0], [250, 2, 9]]) {
    const h = setup({ preferences: { bpm } })
    const old = h.tempo.pickerEntries[column]
    choose(h.tempo, column, { newValue: String(digit) })
    assert.notEqual(h.tempo.pickerEntries[column].id, old.id)
    assert.equal(initialBpm(h.tempo), bpm)
    assert.equal(h.calls.writes.length, 0)
    h.tempo.onNativePickerChange(old.id, { newValue: String(digit) })
    assert.equal(h.calls.writes.length, 0)
  }
})

test('newValue is primary and invalid event payloads cannot change tempo', () => {
  const h = setup({ preferences: { bpm: 173 } })
  choose(h.tempo, 1, { newValue: '6', newSelected: 999 })
  assert.equal(h.tempo.bpm, 163)
  for (const value of ['', '1e2', '1.5', 'text', null, {}, [], Infinity, NaN, -1, 10, 170]) {
    for (let i = 0; i < 3; i++) choose(h.tempo, i, { newValue: value, newSelected: 0 })
  }
  assert.equal(h.tempo.bpm, 163)
})

test('Tap Tempo changes the digits without status chatter; native echoes do not restart sampling', () => {
  const h = setup({ preferences: { meter: '6/8', bpm: 173 } })
  for (let i = 0; i < 4; i++) {
    if (i) h.clock.advance(1000)
    h.tempo.tapTempo()
  }
  assert.equal(h.tempo.bpm, 60)
  assert.equal(initialBpm(h.tempo), 60)
  const writes = h.calls.writes.length
  for (const [i, digit] of ['0', '6', '0'].entries()) choose(h.tempo, i, { newValue: digit })
  h.clock.advance(1000)
  h.tempo.tapTempo()
  assert.equal(h.tempo.bpm, 60)
  assert.equal(h.tempo.tapHint, undefined)
  assert.equal(h.tempo.notice, '')
  assert.equal(h.calls.writes.length, writes)
})

test('native echoes and rejected boundary edits never retry failed writes; explicit retry still works', () => {
  const h = setup({ deferSaves: true })
  choose(h.tempo, 0, { newValue: '9' })
  h.finishSave(false)
  choose(h.tempo, 2, { newValue: '0' })
  choose(h.tempo, 2, { newValue: '9' })
  assert.equal(h.pendingSaves(), 0)
  assert.equal(h.tempo.warning, true)
  h.tempo.retrySave()
  h.finishSave()
  assert.equal(h.stored().bpm, 250)
})

test('invalid, hidden, loading, and post-navigation callbacks cannot change preferences', () => {
  const h = setup()
  for (let i = 0; i < 3; i++) {
    for (const event of [null, {}, { newSelected: -1 }, { newSelected: 10 }, { newSelected: 2.5 },
      { newSelected: '3' }, { newSelected: Infinity }]) choose(h.tempo, i, event)
  }
  h.tempo.onHide()
  choose(h.tempo, 2, { newValue: '3' })
  h.tempo.onShow()
  h.tempo.goBack()
  choose(h.tempo, 0, { newValue: '9' })
  assert.equal(h.calls.writes.length, 0)
  assert.equal(h.tempo.notice, '')
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
  }
})
