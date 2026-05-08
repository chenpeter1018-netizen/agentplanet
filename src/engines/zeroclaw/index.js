/**
 * ZeroClaw 引擎 — 便携运维工具箱
 * 独立 Rust 二进制，可维护/修复/备份其他引擎
 */
import { t } from '../../lib/i18n.js'
import { api, invalidate } from '../../lib/tauri-api.js'

let _ready = false
let _running = false
let _listeners = []
let _pollTimer = null

const ZEROCLAW_ICON = '<img src="/zeroclaw-icon.png" alt="ZeroClaw" width="18" height="18" style="display:block;object-fit:contain">'

async function detectZeroclawStatus() {
  try {
    invalidate('check_zeroclaw')
    const info = await api.checkZeroclaw()
    _ready = !!info?.installed
    _running = !!info?.running
  } catch (_) {
    _ready = false
    _running = false
  }
  _listeners.forEach(fn => { try { fn({ ready: _ready, running: _running }) } catch (_) {} })
  return _ready
}

function startPoll() {
  if (_pollTimer) return
  _pollTimer = setInterval(detectZeroclawStatus, 15000)
}

function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

export default {
  id: 'zeroclaw',
  name: 'ZeroClaw',
  description: 'ZeroClaw — 便携运维引擎，可维护/修复/备份其他引擎',
  icon: ZEROCLAW_ICON,

  async detect() {
    await detectZeroclawStatus()
    return { installed: _ready, ready: _ready }
  },

  async boot() {
    await detectZeroclawStatus()
    startPoll()
    // 引擎启动时若已安装但未运行，自动启动 Gateway
    if (_ready && !_running) {
      try { await api.zeroclawStart() } catch (_) {}
      setTimeout(() => detectZeroclawStatus(), 2000)
    }
  },

  cleanup() {
    stopPoll()
  },

  getNavItems() {
    if (!_ready) {
      return [{
        section: '',
        items: [
          { route: '/z/setup', label: t('sidebar.setup'), icon: 'setup' },
          { route: '/z/service', label: t('sidebar.services'), icon: 'services' },
        ]
      }, {
        section: '',
        items: [
          { route: '/about', label: t('sidebar.about'), icon: 'about' },
        ]
      }]
    }
    return [
      { section: '', items: [
        { route: '/z/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
        { route: '/z/chat', label: t('sidebar.aiChat'), icon: 'chat' },
        { route: '/z/service', label: t('sidebar.services'), icon: 'services' },
      ]},
      { section: t('sidebar.sectionMaintain'), collapsed: true, id: 'maintain', items: [
        { route: '/z/backup', label: t('sidebar.backup'), icon: 'backup' },
        { route: '/z/logs', label: t('sidebar.logs'), icon: 'logs' },
        { route: '/z/knowledge', label: t('sidebar.knowledge'), icon: 'memory' },
      ]},
      { section: '', items: [
        { route: '/about', label: t('sidebar.about'), icon: 'about' },
      ]},
    ]
  },

  getRoutes() {
    return [
      { path: '/z/setup', loader: () => import('./pages/setup.js') },
      { path: '/z/dashboard', loader: () => import('./pages/dashboard.js') },
      { path: '/z/chat', loader: () => import('./pages/chat.js') },
      { path: '/z/service', loader: () => import('./pages/service.js') },
      { path: '/z/backup', loader: () => import('./pages/backup.js') },
      { path: '/z/logs', loader: () => import('./pages/logs.js') },
      { path: '/z/knowledge', loader: () => import('./pages/knowledge.js') },
      { path: '/about', loader: () => import('../../pages/about.js') },
    ]
  },

  getSetupRoute() { return '/z/setup' },
  getDefaultRoute() { return '/z/dashboard' },

  isReady() { return _ready },
  isGatewayRunning() { return _running },
  isGatewayForeign() { return false },

  onStateChange(fn) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter(cb => cb !== fn) }
  },
  onReadyChange(fn) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter(cb => cb !== fn) }
  },

  isFeatureAvailable() { return true },
}
