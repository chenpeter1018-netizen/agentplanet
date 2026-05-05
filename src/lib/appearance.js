/**
 * Agent Planet 三主题管理
 * 白晨(morning-light) / 暗夜(night-dark) / 星球(planet-nebula)
 */
import { isTauriRuntime } from './backend-bridge.js'

const THEME_KEY = 'agentplanet-theme'
const THEMES = ['morning-light', 'night-dark', 'planet-nebula']

let _tauriWindowModule = null
async function getTauriCurrentWindow() {
  if (!isTauriRuntime()) return null
  if (_tauriWindowModule === false) return null
  if (!_tauriWindowModule) {
    try {
      _tauriWindowModule = await import('@tauri-apps/api/window')
    } catch (_) {
      _tauriWindowModule = false
      return null
    }
  }
  try { return _tauriWindowModule.getCurrentWindow() } catch (_) { return null }
}

async function syncTauriTitleBar(theme) {
  const win = await getTauriCurrentWindow()
  if (!win || typeof win.setTheme !== 'function') return
  try {
    if (theme === 'morning-light') await win.setTheme('light')
    else if (theme === 'night-dark' || theme === 'planet-nebula') await win.setTheme('dark')
  } catch (_) {}
}

export function initAppearance() {
  const saved = localStorage.getItem(THEME_KEY)
  const theme = saved && THEMES.includes(saved) ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night-dark' : 'morning-light')
  applyTheme(theme)
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return
  const html = document.documentElement
  html.style.setProperty('--theme-reveal-x', theme === 'night-dark' || theme === 'planet-nebula' ? '0%' : '100%')
  html.style.setProperty('--theme-reveal-y', theme === 'night-dark' || theme === 'planet-nebula' ? '100%' : '0%')

  const doApply = () => applyTheme(theme)
  if (document.startViewTransition) {
    document.startViewTransition(doApply)
  } else {
    doApply()
  }
  return theme
}

export function getTheme() {
  return document.documentElement.dataset.theme || 'morning-light'
}

export function getAvailableThemes() {
  return [
    { id: 'morning-light', label: 'sidebar.themeLight', icon: 'sun' },
    { id: 'night-dark', label: 'sidebar.themeDark', icon: 'moon' },
    { id: 'planet-nebula', label: 'sidebar.themeNebula', icon: 'star' },
  ]
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
  syncTauriTitleBar(theme)
}
