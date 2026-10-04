const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pageHarness } = require('./helpers.cjs')

function observeMount(page) {
  let ready = page.ready
  const states = []
  Object.defineProperty(page, 'ready', {
    get: () => ready,
    set(value) {
      ready = value
      if (value) states.push({ bpm: page.bpm, meter: page.meter, warning: page.warning })
    }
  })
  return states
}

test('tempo controls are conditionally created, not merely hidden with a default slider value', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/tempo/index.ux'), 'utf8')
  const template = source.split('<script>')[0]
  const gate = template.indexOf('<div class="content" if="{{ ready }}">')
  assert.ok(gate > 0)
  assert.ok(template.indexOf('<text class="bpm">') > gate)
  assert.ok(template.indexOf('<slider ') > gate)
  assert.match(template, /class="loading" if="\{\{ !ready \}\}"/)
  // Back/swipe must remain attached to the always-present outer page.
  assert.ok(template.indexOf('ontouchend="onPageTouchEnd"') < gate)
})

test('first deferred load mounts once with saved BPM, meter and status and never writes 120', () => {
  const h = pageHarness({ preferences: { bpm: 173, meter: '6/8' }, deferLoad: true })
  h.page.onHide()
  const tempo = h.createPage('tempo')
  const mounts = observeMount(tempo)
  assert.equal(tempo.ready, false)
  tempo.onSliderChange({ progress: 120, isFromUser: false })
  tempo.onSliderChange({ progress: 120, isFromUser: true })
  h.finishLoad()
  assert.deepEqual(mounts, [{ bpm: 173, meter: '6/8', warning: false }])
  assert.deepEqual(h.calls.writes, [])
  assert.equal(h.stored().bpm, 173)
  assert.equal(h.clock.pending(), 0)
})

test('retained tempo pages stay current while hidden and do not remount on return', () => {
  const h = pageHarness({ preferences: { bpm: 87 } })
  h.page.onHide()
  const tempo = h.createPage('tempo')
  assert.equal(tempo.bpm, 87)
  tempo.onHide()
  assert.equal(tempo.ready, true)
  // A separate instance updates the app-owned store while this one is hidden.
  const other = h.createPage('tempo')
  other.setTempo(211)
  other.onHide()
  const writes = h.calls.writes.length
  assert.equal(tempo.bpm, 211) // Already current, before onShow and its first visible frame.
  const mounts = observeMount(tempo)
  tempo.onShow()
  assert.deepEqual(mounts, [])
  tempo.onSliderChange({ progress: 120, isFromUser: false })
  assert.equal(h.calls.writes.length, writes)
  assert.equal(h.stored().bpm, 211)
  tempo.onHide()
  assert.equal(tempo.ready, true)
})

test('leaving before load completes cannot mount late controls; system back still works', () => {
  for (const action of ['goBack', 'onBackPress', 'onDestroy']) {
    const h = pageHarness({ preferences: { bpm: 173 }, deferLoad: true })
    h.page.onHide()
    const tempo = h.createPage('tempo')
    const mounts = observeMount(tempo)
    tempo[action]()
    h.finishLoad()
    assert.deepEqual(mounts, [], action)
    assert.equal(tempo.ready, false)
    assert.deepEqual(h.calls.writes, [])
    assert.equal(h.clock.pending(), 0)
  }
})

test('failed preference load finishes with a visible warning rather than an endless loading state', () => {
  const h = pageHarness({ deferLoad: true })
  h.page.onHide()
  const tempo = h.createPage('tempo')
  const mounts = observeMount(tempo)
  h.finishLoad(true)
  assert.deepEqual(mounts, [{ bpm: 120, meter: '4/4', warning: true }])
  assert.equal(tempo.status, 'Could not load preferences')
  assert.deepEqual(h.calls.writes, [])
})
