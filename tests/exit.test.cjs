const test = require('node:test')
const assert = require('node:assert/strict')
const { pageHarness } = require('./helpers.cjs')

test('right swipe exits after stopping playback and releasing screen-on', () => {
  const { page, calls, clock } = pageHarness()
  page.toggleRunning()
  page.onPageSwipe({ direction: 'right' })
  assert.equal(calls.exits, 1)
  assert.equal(page.running, false)
  assert.equal(page.lit, false)
  assert.equal(clock.pending(), 0)
  assert.deepEqual(calls.keepScreenOn, [true, false])
  assert.deepEqual(calls.exitTimerCounts, [0])
})

test('exit works during onboarding and while preferences are loading', () => {
  for (const options of [{ preferences: { onboardingDone: false } }, { deferLoad: true }]) {
    const { page, calls, clock } = pageHarness(options)
    page.onPageSwipe({ direction: 'right' })
    assert.equal(calls.exits, 1)
    assert.equal(clock.pending(), 0)
    assert.equal(calls.writes.length, 0)
  }
})

test('system back cleans up and returns false for native navigation', () => {
  const { page, clock, calls } = pageHarness()
  page.toggleRunning()
  assert.equal(page.onBackPress(), false)
  assert.equal(clock.pending(), 0)
  assert.equal(page.running, false)
  assert.equal(calls.exits, 0)
  assert.deepEqual(calls.keepScreenOn, [true, false])
})

test('unavailable terminate API falls back to router.back', () => {
  const { page, clock, calls } = pageHarness({ terminateFails: true })
  page.toggleRunning()
  page.onPageSwipe({ direction: 'right' })
  assert.deepEqual(calls.routes, ['back'])
  assert.equal(clock.pending(), 0)
  assert.equal(page.running, false)
})

test('right swipe in tempo returns home once, clears taps, and does not terminate', () => {
  const { page, createPage, calls, clock } = pageHarness()
  page.onHide()
  const tempo = createPage('tempo')
  tempo.tapTempo()
  tempo.onPageSwipe({ direction: 'right' })
  tempo.onPageSwipe({ direction: 'right' })
  assert.deepEqual(calls.routes, ['back'])
  assert.equal(calls.exits, 0)
  assert.equal(clock.pending(), 0)
})
