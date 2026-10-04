const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')
const { createPreferenceStore } = require('../src/common/preferences')

function enter(h, name) {
  h.page.onHide()
  return h.createPage(name)
}

for (const name of ['tempo', 'rhythm', 'appearance']) {
  test(`${name}: failed save survives navigation; retry persists without changing the selection`, () => {
    const h = pageHarness({ preferences: { bpm: 120 }, deferSaves: true })
    const page = enter(h, name)
    if (name === 'tempo') page.setTempo(173)
    else if (name === 'rhythm') page.cycleSlot(0)
    else page.chooseTheme('violet')
    assert.equal(page.status, page.labels.saving)
    page.goBack()
    page.onHide()
    h.page.onShow()
    h.finishSave(false)
    assert.equal(h.page.status, h.page.labels.saveError)
    const pending = h.page._store.getStatus()
    assert.equal(pending, 'saveError')
    assert.equal(h.stored().bpm, 120)
    h.page.onHide()
    page.onShow()
    assert.equal(page.status, page.labels.saveError)
    // Retrying tempo or theme can use the already-selected value; rhythm uses its error text.
    if (name === 'tempo') page.setTempo(173)
    else if (name === 'appearance') page.chooseTheme('violet')
    else page.retrySave()
    assert.equal(page.status, page.labels.saving)
    page.retrySave()
    assert.equal(h.pendingSaves(), 1)
    h.finishSave()
    assert.equal(page.status, page.labels.saved)
    assert.equal(h.page._store.getStatus(), 'saved')
    const disk = h.stored()
    if (name === 'tempo') assert.equal(disk.bpm, 173)
    else if (name === 'rhythm') assert.equal(disk.patterns['4/4'][0], 'short')
    else assert.equal(disk.theme, 'violet')
    const restarted = pageHarness({ preferences: disk })
    if (name === 'tempo') assert.equal(restarted.page.bpm, 173)
    else if (name === 'rhythm') assert.equal(restarted.page._pattern[0], 'short')
    else assert.equal(restarted.page.theme, 'violet')
    assert.equal(h.clock.pending(), 0)
  })
}

test('home can retry an error from a destroyed page, including a failed retry', () => {
  const h = pageHarness({ preferences: { bpm: 120 }, deferSaves: true })
  const t = enter(h, 'tempo')
  t.setTempo(173)
  t.onDestroy()
  h.page.onShow()
  h.finishSave(false)
  assert.equal(h.page.status, h.page.labels.saveError)
  h.page.retrySave()
  h.finishSave(false)
  assert.equal(h.page.status, h.page.labels.saveError)
  h.page.retrySave()
  h.finishSave()
  assert.equal(h.page.status, h.page.labels.ready)
  assert.equal(h.stored().bpm, 173)
  assert.equal(h.page.running, false)
})

test('reopening while save is pending shows Saving, never Saved', () => {
  const h = pageHarness({ deferSaves: true })
  const t = enter(h, 'tempo')
  t.setTempo(173)
  t.onHide()
  t.onShow()
  assert.equal(t.status, t.labels.saving)
  h.finishSave(false)
  assert.equal(t.warning, true)
  assert.equal(t.status, t.labels.saveError)
})

test('a new edit after failure persists the latest snapshot and clears the old error', () => {
  const h = pageHarness({ deferSaves: true })
  const t = enter(h, 'tempo')
  t.setTempo(173)
  h.finishSave(false)
  t.setTempo(181)
  t.retrySave() // Must not launch a concurrent stale retry.
  assert.equal(h.pendingSaves(), 1)
  t.setTempo(193)
  h.finishSave()
  assert.equal(t.status, t.labels.saving)
  h.finishSave()
  assert.equal(t.status, t.labels.saved)
  assert.equal(h.stored().bpm, 193)
})

test('store publishes durable save status, serializes writes and recovers a load error', () => {
  const writes = []
  const store = createPreferenceStore({ get(o) { o.fail() }, set(o) { writes.push(o) } })
  const states = []
  const off = store.subscribe((values, failed, status) => states.push([status, failed]))
  store.load(() => {})
  assert.equal(store.getStatus(), 'loadError')
  store.update({ bpm: 123 })
  writes[0].fail()
  assert.equal(store.getStatus(), 'saveError')
  store.retry()
  store.retry()
  assert.equal(writes.length, 2)
  writes[1].success()
  assert.deepEqual(states, [['loadError', true], ['saving', true], ['saveError', true], ['saving', true], ['saved', false]])
  store.load((values, failed, status) => {
    assert.equal(values.bpm, 123)
    assert.equal(failed, false)
    assert.equal(status, 'saved')
  })
  store.retry()
  assert.equal(writes.length, 2)
  off()
})

test('same tempo/theme selections do not write when already saved', () => {
  const h = pageHarness()
  const t = enter(h, 'tempo')
  t.setTempo(120)
  t.retrySave()
  t.onHide()
  const a = h.createPage('appearance')
  a.chooseTheme('mint')
  a.retrySave()
  assert.equal(h.calls.writes.length, 0)
})

test('rhythm changes replace one cell/row only; save status and unrelated edits keep grid identity', () => {
  const h = pageHarness({ deferSaves: true })
  const r = enter(h, 'rhythm')
  const first = r.rowTop[0], second = r.rowTop[1], bottom = r.rowBottom
  let row = r.rowTop, assignments = 0
  Object.defineProperty(r, 'rowTop', {
    get: () => row,
    set(value) { row = value; assignments++ }
  })
  r.cycleSlot(0)
  assert.equal(assignments, 1)
  assert.notEqual(r.rowTop[0], first)
  assert.equal(r.rowTop[1], second)
  assert.equal(r.rowBottom, bottom)
  const edited = r.rowTop
  h.finishSave(false)
  assert.equal(r.rowTop, edited)
  r.retrySave()
  h.finishSave()
  assert.equal(r.rowTop, edited)
  h.page._store.update({ theme: 'blue', bpm: 173 })
  h.finishSave()
  assert.equal(r.rowTop, edited)
  assert.equal(r.rowBottom, bottom)
  assert.equal(assignments, 1)
  r.nextMeter()
  assert.equal(r.meter, '6/8')
  assert.equal(r.rowTop.length, 3)
  assert.equal(r.rowBottom.length, 3)
  assert.deepEqual([...r.rowTop, ...r.rowBottom].map(cell => cell.index), [0, 1, 2, 3, 4, 5])
})

for (const name of ['index', 'tempo', 'rhythm', 'appearance']) {
  for (const order of ['gesture-first', 'system-first']) {
    test(`${name} ${order}: one navigation only, then next showing resets the guard`, () => {
      const h = pageHarness()
      const p = name === 'index' ? h.page : enter(h, name)
      if (name === 'index') p.toggleRunning()
      else if (name === 'tempo') p.tapTempo()
      const gesture = () => name === 'index' ? p.exitApp(true) : p.goBack(true)
      let systemNavigations = 0
      const system = () => { if (p.onBackPress() !== true) systemNavigations++ }
      if (order === 'gesture-first') { gesture(); system() }
      else { system(); gesture() }
      system()
      assert.equal(h.calls.exits + h.calls.routes.filter(route => route === 'back').length + systemNavigations, 1)
      assert.equal(h.clock.pending(), 0)
      p.onHide()
      p.onShow()
      assert.equal(p.onBackPress(), false)
    })
  }
}

test('rhythm lists have stable native IDs and retry uses existing status text, not a new page', () => {
  const root = path.join(__dirname, '..')
  const rhythm = fs.readFileSync(path.join(root, 'src/pages/rhythm/index.ux'), 'utf8')
  assert.match(rhythm, /for="\{\{ rowTop \}\}" tid="index"/)
  assert.match(rhythm, /for="\{\{ rowBottom \}\}" tid="index"/)
  for (const name of ['index', 'tempo', 'rhythm', 'appearance']) {
    const source = fs.readFileSync(path.join(root, `src/pages/${name}/index.ux`), 'utf8')
    assert.match(source.split('<script>')[0], /<text[^>]*onclick="retrySave"/)
  }
})
