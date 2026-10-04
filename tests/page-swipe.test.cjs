const test = require('node:test')
const assert = require('node:assert/strict')
const { createPageSwipe } = require('../src/common/page-swipe')
const { pageHarness } = require('./helpers.cjs')
const touch = (x, y = 180, identifier = 0) => ({ clientX: x, clientY: y, identifier })
const start = p => ({ touches: [p] })
const end = p => ({ touches: [], changedTouches: [p] })

function swipe(page, from, to, clock) {
  page.onPageTouchStart(start(from))
  if (clock) clock.advance(1200) // Deliberately slow; not a native quick flick.
  page.onPageTouchMove(start(to))
  page.onPageTouchEnd(end(to))
}

test('ordinary slow horizontal drags navigate, independent of velocity', () => {
  const h = pageHarness()
  h.page.toggleRunning()
  swipe(h.page, touch(260), touch(150, 184), h.clock)
  assert.deepEqual(h.calls.routes, ['/pages/tempo'])
  assert.equal(h.page.running, false)
  assert.equal(h.clock.pending(), 0)
  assert.deepEqual(h.calls.keepScreenOn, [true, false])
  h.page.onHide()
  const tempo = h.createPage('tempo')
  tempo.tapTempo()
  swipe(tempo, touch(70), touch(200), h.clock)
  assert.deepEqual(h.calls.routes, ['/pages/tempo', 'back'])
  assert.equal(h.clock.pending(), 0)
  assert.equal(h.calls.exits, 0)
})

test('home right drag exits once and leaves no timers', () => {
  const h = pageHarness()
  h.page.toggleRunning()
  swipe(h.page, touch(40), touch(120))
  h.page.onPageTouchEnd(end(touch(120)))
  h.page.exitApp()
  assert.equal(h.calls.exits, 1)
  assert.equal(h.clock.pending(), 0)
})

test('tap jitter stays a native click; dragging across controls cannot toggle them', () => {
  const h = pageHarness()
  swipe(h.page, touch(160), touch(164, 182))
  h.page.toggleRunning()
  assert.equal(h.page.running, true)
  h.page.stop()
  // Too short for navigation, but enough movement to disqualify an accidental click.
  swipe(h.page, touch(160), touch(183))
  h.page.toggleRunning()
  h.page.toggleFlash()
  h.page.toggleVibration()
  h.page.openTempo()
  assert.equal(h.page.running, false)
  assert.equal(h.page.flash, true)
  assert.equal(h.page.vibration, true)
  assert.deepEqual(h.calls.routes, [])
  h.clock.advance(351)
  h.page.toggleRunning()
  assert.equal(h.page.running, true)
})

test('four directions use axis locking; diagonal and changing-axis motion cannot misnavigate', () => {
  const g = createPageSwipe()
  for (const [p, expected] of [[touch(160, 300), 'down'], [touch(160, 60), 'up'], [touch(220, 240), null]]) {
    g.start(start(touch(160)))
    assert.equal(g.end(end(p)), expected)
  }
  g.start(start({ ...touch(250), offsetX: 0, offsetY: 0 }))
  assert.equal(g.end(end({ ...touch(180), offsetX: 190, offsetY: 190 })), 'left')
  g.start(start(touch(160)))
  g.move(start(touch(160, 260)))
  assert.equal(g.end(end(touch(260, 180))), null) // Vertical then horizontal is not a back gesture.
})

test('native picker touch exclusion survives bubbling and never returns/exits', () => {
  const h = pageHarness()
  h.page.onHide()
  const tempo = h.createPage('tempo')
  tempo.onPickerTouchStart() // Child receives touchstart before its parent.
  swipe(tempo, touch(30), touch(290), h.clock)
  tempo.onPickerChange({ newSelected: 123, newValue: '173' })
  tempo.tapTempo() // Ignore any synthetic click after dragging.
  assert.equal(tempo.bpm, 173)
  assert.equal(h.stored().bpm, 173)
  assert.equal(h.clock.pending(), 0)
  assert.deepEqual(h.calls.routes, [])
  assert.equal(h.calls.exits, 0)
  h.clock.advance(351)
  swipe(tempo, touch(40), touch(150))
  assert.deepEqual(h.calls.routes, ['back'])
})

test('multi-touch, invalid coordinates, wrong finger, and cancelled gestures cannot navigate', () => {
  const g = createPageSwipe()
  g.start(start(touch(160)))
  g.move({ touches: [touch(50), touch(100, 180, 1)] })
  assert.equal(g.end(end(touch(50))), null)
  g.start(start(touch(NaN)))
  assert.equal(g.end(end(touch(50))), null)
  g.start(start(touch(160)))
  assert.equal(g.end(end(touch(50, 180, 1))), null)
  g.cancel()
  assert.equal(g.end(end(touch(50))), null)
  g.start(start(touch(160)))
  assert.equal(g.end({ touches: [], changedTouches: [] }), null)
})

test('system back arriving before touchend does not cause a second exit', () => {
  const h = pageHarness()
  h.page.toggleRunning()
  h.page.onPageTouchStart(start(touch(40)))
  assert.equal(h.page.onBackPress(), false)
  h.page.onPageTouchEnd(end(touch(140)))
  assert.equal(h.calls.exits, 0)
  assert.equal(h.clock.pending(), 0)
})

test('hidden pages ignore late navigation and reset gesture state on return', () => {
  const h = pageHarness()
  h.page.onPageTouchStart(start(touch(160)))
  h.page.onHide()
  h.page.onPageTouchEnd(end(touch(40)))
  assert.deepEqual(h.calls.routes, [])
  h.page.onShow()
  h.page.toggleRunning()
  assert.equal(h.page.running, true)
})

test('slow up/down swipes across home controls open rhythm/colors once without clicking', () => {
  for (const [targetY, route] of [[80, 'rhythm'], [300, 'appearance']]) {
    const h = pageHarness()
    h.page.toggleRunning()
    swipe(h.page, touch(160), touch(165, targetY), h.clock)
    h.page.toggleVibration()
    h.page.toggleRunning()
    assert.deepEqual(h.calls.routes, ['/pages/' + route])
    assert.equal(h.page.vibration, true)
    assert.equal(h.page.running, false)
    assert.equal(h.clock.pending(), 0)
    h.page.onHide()
    const subpage = h.createPage(route)
    swipe(subpage, touch(40), touch(180))
    assert.deepEqual(h.calls.routes, ['/pages/' + route, 'back'])
    assert.equal(h.calls.exits, 0)
    assert.equal(h.clock.pending(), 0)
  }
})

test('swiping a rhythm cell or color swatch never also edits it', () => {
  for (const name of ['rhythm', 'appearance']) {
    const h = pageHarness()
    h.page.onHide()
    const page = h.createPage(name)
    swipe(page, touch(40), touch(160))
    if (name === 'rhythm') page.cycleSlot(0)
    else page.chooseTheme('blue')
    assert.equal(h.calls.writes.length, 0)
    assert.deepEqual(h.calls.routes, ['back'])
  }
})
