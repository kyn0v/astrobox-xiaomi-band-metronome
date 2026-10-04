const { MIN_BPM, MAX_BPM } = require('./metronome')
const TAP_TIMEOUT_MS = 2000

function createTapTempo() {
  let taps = []

  function result() {
    if (taps.length < 4) return { count: taps.length, bpm: null, outOfRange: false }
    const intervals = taps.slice(1).map((time, index) => time - taps[index])
    const sorted = intervals.slice().sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    const steady = intervals.filter(interval => Math.abs(interval - median) <= median * 0.25)
    if (steady.length < 3) return { count: steady.length + 1, bpm: null, outOfRange: false }
    const bpm = Math.round(60000 / (steady.reduce((sum, interval) => sum + interval, 0) / steady.length))
    const outOfRange = bpm < MIN_BPM || bpm > MAX_BPM
    return { count: 4, bpm: outOfRange ? null : bpm, outOfRange }
  }

  return {
    tap(time) {
      if (typeof time !== 'number' || !isFinite(time)) return result()
      if (taps.length) {
        const interval = time - taps[taps.length - 1]
        if (interval < 0 || interval >= TAP_TIMEOUT_MS) taps = []
        // Ignore accidental double taps without shifting the previous timestamp.
        else if (interval < 200) return result()
      }
      taps.push(time)
      if (taps.length > 7) taps.shift()
      return result()
    },
    reset() { taps = [] }
  }
}

module.exports = { createTapTempo, TAP_TIMEOUT_MS }
