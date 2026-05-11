/**
 * 主题管理（日间/夜间/赛博朋克 三模式循环）
 *
 * 桌面端：除了切换 <html data-theme>，还会同步 Tauri 原生窗口标题栏的
 * 主题，避免夜间/赛博朋克模式下出现颜色割裂。Web 端该步骤会安静跳过。
 */
import { isTauriRuntime } from './tauri-api.js'

const THEME_KEY = 'agent-planet-theme'
export const THEMES = ['light', 'dark', 'cyberpunk']

// 延迟加载 Tauri window 模块，Web 构建不会真正拉取
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
  try {
    return _tauriWindowModule.getCurrentWindow()
  } catch (_) {
    return null
  }
}

async function syncTauriTitleBar(theme) {
  const win = await getTauriCurrentWindow()
  if (!win || typeof win.setTheme !== 'function') return
  try {
    // Tauri v2: 接受 'light' | 'dark' | null，赛博朋克用 dark
    await win.setTheme(theme === 'light' ? 'light' : 'dark')
  } catch (_) {}
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  const theme = (saved && THEMES.includes(saved))
    ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  applyTheme(theme)
}

export function cycleTheme(onApply) {
  const current = getTheme()
  const currentIndex = THEMES.indexOf(current)
  const next = THEMES[(currentIndex + 1) % THEMES.length]
  return setTheme(next, onApply)
}

export function getTheme() {
  return document.documentElement.dataset.theme || 'light'
}

export function setTheme(theme, onApply) {
  if (!THEMES.includes(theme)) return getTheme()

  const html = document.documentElement
  if (theme === 'cyberpunk') {
    html.style.setProperty('--theme-reveal-x', '50%')
    html.style.setProperty('--theme-reveal-y', '50%')
  } else {
    const toDark = theme === 'dark'
    html.style.setProperty('--theme-reveal-x', toDark ? '0%' : '100%')
    html.style.setProperty('--theme-reveal-y', toDark ? '100%' : '0%')
  }

  const doApply = () => {
    applyTheme(theme)
    if (onApply) onApply(theme)
  }

  if (document.startViewTransition) {
    document.startViewTransition(doApply)
  } else {
    doApply()
  }
  return theme
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
  syncTauriTitleBar(theme)

  // 星场动画：赛博朋克启动，其他停止
  if (theme === 'cyberpunk') {
    import('./starfield.js').then(m => m.startStarfield()).catch(() => {})
  } else {
    import('./starfield.js').then(m => { if (m.isStarfieldRunning()) m.stopStarfield() }).catch(() => {})
  }
}
