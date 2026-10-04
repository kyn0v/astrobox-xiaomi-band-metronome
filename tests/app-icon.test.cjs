const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

test('manifest launcher icon has a transparent exterior and preserves the circular badge', () => {
  const root = path.join(__dirname, '..')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'))
  assert.equal(manifest.icon, '/common/icon.png')
  const png = fs.readFileSync(path.join(root, 'src', manifest.icon.slice(1)))
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const chunks = []
  for (let i = 8; i < png.length;) {
    const size = png.readUInt32BE(i)
    const type = png.toString('ascii', i + 4, i + 8)
    if (type === 'IHDR') {
      assert.equal(png.readUInt32BE(i + 8), 192)
      assert.equal(png.readUInt32BE(i + 12), 192)
      assert.equal(png[i + 16], 8)
      assert.equal(png[i + 17], 6) // RGBA, not RGB with a painted background.
    }
    if (type === 'IDAT') chunks.push(png.subarray(i + 8, i + 8 + size))
    i += size + 12
  }
  const bytes = zlib.inflateSync(Buffer.concat(chunks))
  const stride = 192 * 4 + 1
  let transparent = 0, bars = 0, badge = 0
  for (let y = 0; y < 192; y++) {
    assert.equal(bytes[y * stride], 0) // Original generator uses filter 0.
    for (let x = 0; x < 192; x++) {
      const offset = y * stride + 1 + x * 4
      const rgba = [...bytes.subarray(offset, offset + 4)]
      if ((x - 96) ** 2 + (y - 96) ** 2 >= 78 ** 2) {
        assert.deepEqual(rgba, [0, 0, 0, 0])
        transparent++
      } else {
        assert.equal(rgba[3], 255)
        if (rgba[0] === 112) { assert.deepEqual(rgba, [112, 224, 189, 255]); bars++ }
        else { assert.deepEqual(rgba, [41, 52, 61, 255]); badge++ }
      }
    }
  }
  assert.equal(transparent, 17767)
  assert.equal(bars, 3384)
  assert.equal(badge, 15713)
})
