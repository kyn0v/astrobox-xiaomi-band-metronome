const { getMeter } = require('./rhythm')
const MIN_BPM = 50
const MAX_BPM = 250
const DEFAULT_BPM = 120

// BPM always counts quarter notes in simple meters, dotted quarters in 6/8.
// In 6/8 each callback represents one eighth note (three callbacks per BPM beat).
function createMetronome(onBeat, clock) {
  clock = clock || {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: id => clearTimeout(id)
  }
  let bpm = DEFAULT_BPM
  let meter = getMeter('4/4')
  let running = false
  let timer = null
  let nextAt = 0
  let nextStep = 0
  const interval = () => 60000 / bpm / meter.divisions

  function cancelTimer() {
    if (timer !== null) { clock.clearTimeout(timer); timer = null }
  }
  function schedule() {
    // A callback can stop or reschedule playback without creating two timers.
    if (running && timer === null) timer = clock.setTimeout(tick, Math.max(1, Math.ceil(nextAt - clock.now())))
  }
  function emitBeat(step) { onBeat(step % meter.slots, interval()) }
  function tick() {
    timer = null
    if (!running) return
    if (clock.now() < nextAt) { schedule(); return }
    const duration = interval()
    const skipped = Math.floor((clock.now() - nextAt) / duration)
    const step = nextStep + skipped
    nextStep = step + 1
    nextAt += (skipped + 1) * duration
    emitBeat(step)
    if (running) {
      // Advance both time and musical position; never emit a catch-up burst.
      if (nextAt <= clock.now()) {
        const missed = Math.floor((clock.now() - nextAt) / interval()) + 1
        nextStep += missed
        nextAt += missed * interval()
      }
      schedule()
    }
  }
  return {
    setBpm(value) {
      if (typeof value !== 'number' || !isFinite(value)) return bpm
      const nextBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)))
      if (nextBpm === bpm) return bpm
      bpm = nextBpm
      if (running) {
        cancelTimer()
        nextAt = clock.now() + interval()
        schedule()
      }
      return bpm
    },
    setMeter(value) {
      const next = getMeter(value)
      if (next.id !== meter.id) {
        running = false
        cancelTimer()
        meter = next
        nextStep = 0
      }
      return meter.id
    },
    start() {
      if (running) return
      running = true
      nextStep = 1
      nextAt = clock.now() + interval()
      emitBeat(0)
      schedule()
    },
    stop() { running = false; cancelTimer() }
  }
}

module.exports = { createMetronome, MIN_BPM, MAX_BPM, DEFAULT_BPM }
