const METERS = ['2/4', '3/4', '4/4', '6/8']
const MODES = ['long', 'short', 'off']

function getMeter(value) {
  const id = METERS.indexOf(value) >= 0 ? value : '4/4'
  return { id, slots: Number(id[0]), divisions: id === '6/8' ? 3 : 1 }
}

function defaultPattern(meter) {
  return Array.from({ length: getMeter(meter).slots }, (_, i) => i === 0 ? 'long' : 'short')
}

// Keep a separate pattern for each meter. Always copy arrays at storage boundaries.
function normalizePatterns(input) {
  const source = input && typeof input === 'object' ? input : {}
  const patterns = {}
  METERS.forEach(meter => {
    const defaults = defaultPattern(meter)
    const saved = source[meter]
    patterns[meter] = defaults.map((mode, index) =>
      Array.isArray(saved) && MODES.indexOf(saved[index]) >= 0 ? saved[index] : mode)
  })
  return patterns
}

function nextMode(mode) { return MODES[(MODES.indexOf(mode) + 1) % MODES.length] }

module.exports = { METERS, getMeter, defaultPattern, normalizePatterns, nextMode }
