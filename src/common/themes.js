const THEMES = {
  mint: { accent: '#6ee7b7', pulse: '#a7f3d0', downbeat: '#d1fae5' },
  blue: { accent: '#7dd3fc', pulse: '#bae6fd', downbeat: '#e0f2fe' },
  violet: { accent: '#c4b5fd', pulse: '#ddd6fe', downbeat: '#ede9fe' },
  amber: { accent: '#fcd34d', pulse: '#fde68a', downbeat: '#fef3c7' }
}
const DEFAULT_THEME = 'mint'

function themeId(value) {
  return Object.prototype.hasOwnProperty.call(THEMES, value) ? value : DEFAULT_THEME
}

function getTheme(value) {
  return Object.assign({
    background: '#10151e', surface: '#243041', text: '#f1f5f9',
    muted: '#a8b5c5', onAccent: '#222222'
  }, THEMES[themeId(value)])
}

module.exports = { DEFAULT_THEME, themeId, getTheme }
