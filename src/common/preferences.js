const { MIN_BPM, MAX_BPM, DEFAULT_BPM } = require('./metronome')
const { themeId } = require('./themes')
const { getMeter, normalizePatterns } = require('./rhythm')
const STORAGE_KEY = 'metronome.preferences.v1'

function normalizePreferences(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    bpm: typeof source.bpm === 'number' && isFinite(source.bpm)
      ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(source.bpm))) : DEFAULT_BPM,
    vibration: typeof source.vibration === 'boolean' ? source.vibration : true,
    flash: typeof source.flash === 'boolean' ? source.flash : true,
    theme: themeId(source.theme),
    meter: getMeter(source.meter).id,
    patterns: normalizePatterns(source.patterns),
    onboardingDone: source.onboardingDone === true
  }
}

// One app-owned store: page navigation shares state; writes cannot finish out of order.
function createPreferenceStore(storage) {
  let values = normalizePreferences()
  let loaded = false
  let loading = false
  let loadFailed = false
  let status = 'loading'
  let readers = []
  let saving = false
  let dirty = false
  let writers = []
  const subscribers = new Set()

  function publish() {
    subscribers.forEach(callback => callback(snapshot(), loadFailed, status))
  }

  function snapshot() { return Object.assign({}, values, { patterns: normalizePatterns(values.patterns) }) }

  function finishLoad(raw, failed) {
    if (loaded) return
    try {
      values = normalizePreferences(raw ? JSON.parse(raw) : {})
    } catch (error) {
      values = normalizePreferences()
      failed = true
    }
    loaded = true
    loading = false
    loadFailed = failed
    status = failed ? 'loadError' : 'saved'
    const callbacks = readers
    readers = []
    publish()
    callbacks.forEach(callback => callback(snapshot(), loadFailed, status))
  }

  function flush() {
    if (saving || !dirty) return
    saving = true
    dirty = false
    let settled = false
    function finish(ok) {
      if (settled) return
      settled = true
      saving = false
      if (dirty) {
        flush()
      } else {
        status = ok ? 'saved' : 'saveError'
        if (ok) loadFailed = false
        const callbacks = writers
        writers = []
        publish()
        callbacks.forEach(callback => callback(ok))
      }
    }
    try {
      storage.set({
        key: STORAGE_KEY,
        value: JSON.stringify(values),
        success: () => finish(true),
        fail: () => finish(false)
      })
    } catch (error) {
      if (settled) throw error
      finish(false)
    }
  }

  return {
    // Warm state is delivered synchronously during onInit, before the first render.
    // Keep hidden pages current until onDestroy; returning needs no default frame.
    subscribe(callback) {
      subscribers.add(callback)
      if (loaded) callback(snapshot(), loadFailed, status)
      return () => subscribers.delete(callback)
    },
    load(callback) {
      if (loaded) {
        callback(snapshot(), loadFailed, status)
        return
      }
      readers.push(callback)
      if (loading) return
      loading = true
      try {
        storage.get({
          key: STORAGE_KEY,
          default: '',
          success: raw => finishLoad(raw, false),
          fail: () => finishLoad('', true)
        })
      } catch (error) {
        if (loaded) throw error
        finishLoad('', true)
      }
    },
    getStatus() { return status },
    retry() {
      if (status !== 'saveError') return
      // Retry the latest full snapshot, never an older failed write.
      status = 'saving'
      dirty = true
      publish()
      flush()
    },
    update(patch, callback) {
      if (!loaded) throw new Error('Load preferences before updating them')
      values = normalizePreferences(Object.assign({}, values, patch))
      status = 'saving'
      dirty = true
      if (callback) writers.push(callback)
      publish()
      flush()
      return snapshot()
    }
  }
}

module.exports = { STORAGE_KEY, normalizePreferences, createPreferenceStore }
