const test = require('node:test')
const assert = require('node:assert/strict')
const { pageHarness } = require('./helpers.cjs')
const { getTheme } = require('../src/common/themes')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

test('output notices replace each other and restore playback status without extra vibration', () => {
  const h = pageHarness({ locale: 'zh-CN' })
  h.page.toggleRunning()
  h.page.toggleVibration()
  assert.equal(h.page.status, '振动已关闭')
  h.clock.advance(600)
  h.page.toggleFlash()
  assert.equal(h.page.status, '闪烁已关闭')
  h.clock.advance(600)
  assert.equal(h.page.status, '闪烁已关闭')
  h.clock.advance(500)
  assert.equal(h.page.status, '播放中')
  assert.equal(h.calls.vibrations.length, 1)
  assert.equal(h.clock.pending(), 1) // Only the beat clock remains.
})

test('storage errors supersede a toggle notice and are not hidden by its timeout', () => {
  const h = pageHarness({ saveFails: true, locale: 'zh-CN' })
  h.page.toggleFlash()
  assert.equal(h.page.status, '保存失败，点此重试')
  h.clock.advance(2000)
  assert.equal(h.page.status, '保存失败，点此重试')
  assert.equal(h.clock.pending(), 0)
})

test('notices translate on locale changes and cannot outlive any navigation', () => {
  for (const action of ['openTempo', 'openRhythm', 'openAppearance', 'exitApp', 'onBackPress', 'onHide', 'onDestroy']) {
    const h = pageHarness()
    h.page.toggleRunning()
    h.page.toggleFlash()
    h.setLocale('zh-CN')
    h.page.onConfigurationChanged({ type: 'locale' })
    assert.equal(h.page.status, '闪烁已关闭')
    h.page[action]()
    assert.equal(h.clock.pending(), 0, action)
    assert.equal(h.page.lit, false)
    h.clock.advance(2000)
    assert.equal(h.page.status, '已停止')
  }
})

test('all generated output icons have transparent corners and match each theme accent', () => {
  for (const kind of ['vibration', 'flash']) {
    for (const theme of ['mint', 'blue', 'violet', 'amber', 'off']) {
      const png = fs.readFileSync(path.join(__dirname, `../src/common/icons/${kind}-${theme}.png`))
      const chunks = []
      let width, height
      for (let i = 8; i < png.length;) {
        const size = png.readUInt32BE(i)
        const type = png.toString('ascii', i + 4, i + 8)
        if (type === 'IHDR') {
          width = png.readUInt32BE(i + 8)
          height = png.readUInt32BE(i + 12)
          assert.equal(png[i + 16], 8) // 8-bit RGBA
          assert.equal(png[i + 17], 6)
        }
        if (type === 'IDAT') chunks.push(png.subarray(i + 8, i + 8 + size))
        i += size + 12
      }
      const bytes = zlib.inflateSync(Buffer.concat(chunks))
      const stride = width * 4 + 1
      let opaque = 0, transparent = 0
      const expected = theme === 'off' ? [139, 139, 139] : getTheme(theme).accent.slice(1).match(/../g).map(hex => parseInt(hex, 16))
      for (let y = 0; y < height; y++) {
        assert.equal(bytes[y * stride], 0) // Our generator emits unfiltered rows.
        for (let x = 0; x < width; x++) {
          const offset = y * stride + 1 + x * 4
          const alpha = bytes[offset + 3]
          if (alpha === 0) transparent++
          if (alpha === 255) {
            opaque++
            assert.deepEqual([...bytes.subarray(offset, offset + 3)], expected)
          }
          if ((x < 4 || x >= width - 4) && (y < 4 || y >= height - 4)) assert.equal(alpha, 0)
        }
      }
      assert.ok(opaque > 0)
      assert.ok(transparent > width * height / 2)
    }
  }
})
