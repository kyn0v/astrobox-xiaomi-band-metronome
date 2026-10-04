const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePreferences, createPreferenceStore, STORAGE_KEY } = require('../src/common/preferences')
const { getStrings } = require('../src/common/strings')
const defaultPatterns = {
  '2/4': ['long', 'short'], '3/4': ['long', 'short', 'short'],
  '4/4': ['long', 'short', 'short', 'short'],
  '6/8': ['long', 'short', 'short', 'short', 'short', 'short']
}

test('defaults and persisted values are validated, not blindly trusted', () => {
  const defaults = normalizePreferences()
  assert.deepEqual(defaults, { bpm: 120, vibration: true, flash: true, theme: 'mint', meter: '4/4', patterns: defaultPatterns, onboardingDone: false })
  for (const value of [null, [], 'bad', { bpm: NaN, vibration: 'false', language: 'unknown' }]) {
    assert.deepEqual(normalizePreferences(value), defaults)
  }
  assert.equal(normalizePreferences({ bpm: 99.8 }).bpm, 100)
  assert.equal(normalizePreferences({ bpm: 0 }).bpm, 50)
  assert.equal(normalizePreferences({ bpm: 1000 }).bpm, 250)
  assert.equal(normalizePreferences({ vibration: false }).vibration, false)
})

test('one asynchronous load serves both pages and protects stored state from mutation', () => {
  let request
  let reads = 0
  const store = createPreferenceStore({ get(options) { reads++; request = options } })
  const results = []
  store.load(value => results.push(value))
  store.load(value => results.push(value))
  assert.equal(reads, 1)
  assert.equal(request.key, STORAGE_KEY)
  request.success('{"bpm":95,"language":"zh"}')
  assert.equal(results.length, 2)
  results[0].bpm = 60
  store.load(value => assert.equal(value.bpm, 95))
  assert.equal(reads, 1)
})

test('missing, corrupt, and unavailable storage fall back without crashing', () => {
  for (const mode of ['missing', 'corrupt', 'fail', 'throw']) {
    const store = createPreferenceStore({
      get(options) {
        if (mode === 'throw') throw new Error('unsupported')
        if (mode === 'fail') options.fail()
        else options.success(mode === 'corrupt' ? '{broken' : '')
      }
    })
    store.load((value, failed) => {
      assert.equal(value.bpm, 120)
      assert.equal(failed, mode !== 'missing')
    })
  }
})

test('writes are serialized and intermediate edits are coalesced into the latest state', () => {
  const requests = []
  const results = []
  const store = createPreferenceStore({ get(o) { o.success('') }, set(o) { requests.push(o) } })
  store.load(() => {})
  store.update({ bpm: 121 }, ok => results.push(ok))
  store.update({ bpm: 122, language: 'zh' }, ok => results.push(ok))
  store.update({ bpm: 123, flash: false }, ok => results.push(ok))
  assert.equal(requests.length, 1)
  requests[0].success()
  assert.equal(requests.length, 2)
  assert.deepEqual(JSON.parse(requests[1].value), {
    bpm: 123, vibration: true, flash: false, theme: 'mint', meter: '4/4', patterns: defaultPatterns, onboardingDone: false
  })
  assert.equal(results.length, 0)
  requests[1].success()
  assert.deepEqual(results, [true, true, true])
})

test('failed saves are reported, retain in-memory settings, and can be retried', () => {
  let fail = true
  const store = createPreferenceStore({
    get(o) { o.success('') },
    set(o) { if (fail) o.fail(); else o.success() }
  })
  store.load(() => {})
  store.update({ bpm: 130 }, ok => assert.equal(ok, false))
  store.load(value => assert.equal(value.bpm, 130))
  fail = false
  store.update({ bpm: 131 }, ok => assert.equal(ok, true))
})

test('thrown storage errors do not leave the save queue stuck', () => {
  const store = createPreferenceStore({ get(o) { o.success('') }, set() { throw new Error('unavailable') } })
  store.load(() => {})
  let failures = 0
  store.update({ bpm: 130 }, ok => { if (!ok) failures++ })
  store.update({ bpm: 131 }, ok => { if (!ok) failures++ })
  assert.equal(failures, 2)
})

test('system locale chooses Chinese or English fallback, without a stored language setting', () => {
  assert.equal(getStrings('zh-CN').start, '开始')
  assert.equal(getStrings('zh_CN').start, '开始')
  assert.equal(getStrings('ZH').start, '开始')
  assert.equal(getStrings('fr').start, 'Start')
  assert.equal(getStrings('en').start, 'Start')
  assert.equal(getStrings(undefined).start, 'Start')
  const legacy = normalizePreferences({ language: 'zh', keepScreenOn: false, bpm: 95, flash: false })
  assert.equal(Object.hasOwn(legacy, 'language'), false)
  assert.equal(Object.hasOwn(legacy, 'keepScreenOn'), false)
  assert.equal(legacy.bpm, 95)
  assert.equal(legacy.flash, false)
  assert.deepEqual(Object.keys(getStrings('en')).sort(), Object.keys(getStrings('zh')).sort())
})
