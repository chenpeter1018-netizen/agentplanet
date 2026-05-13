/**
 * ZeroClaw 引擎 — 100% 复刻 Hermes Agent 页面架构
 * 使用 ZeroClaw Gateway WebSocket 聊天 + REST API
 */
import { t } from '../../lib/i18n.js'
import { api, invalidate } from '../../lib/tauri-api.js'

let _ready = false
let _running = false
let _listeners = []
let _pollTimer = null

const ZC_ICON = '<img src="/zeroclaw-icon.png" alt="ZeroClaw" width="18" height="18" style="display:block;object-fit:contain">'

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
  description: 'ZeroClaw — Private AI Assistant Gateway',
  icon: ZC_ICON,

  async detect() {
    await detectZeroclawStatus()
    return { installed: _ready, ready: _ready }
  },

  async boot() {
    await detectZeroclawStatus()
    startPoll()
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
        { route: '/z/chat', label: t('sidebar.aiChat'), icon: 'chat' },
        { route: '/z/sessions', label: t('sidebar.sessions'), icon: 'sessions' },
        { route: '/z/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
        { route: '/z/service', label: t('sidebar.services'), icon: 'services' },
      ]},
      { section: t('sidebar.sectionData'), collapsed: true, id: 'data', items: [
        { route: '/z/usage', label: t('sidebar.usage'), icon: 'usage' },
        { route: '/z/memory', label: t('sidebar.memory'), icon: 'memory' },
        { route: '/z/cron', label: t('sidebar.cron'), icon: 'cron' },
        { route: '/z/logs', label: t('sidebar.logs'), icon: 'logs' },
        { route: '/z/backup', label: t('sidebar.backup'), icon: 'backup' },
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
      { path: '/z/sessions', loader: () => import('./pages/sessions.js') },
      { path: '/z/memory', loader: () => import('./pages/memory.js') },
      { path: '/z/cron', loader: () => import('./pages/cron.js') },
      { path: '/z/usage', loader: () => import('./pages/usage.js') },
      { path: '/z/logs', loader: () => import('./pages/logs.js') },
      { path: '/z/service', loader: () => import('./pages/service.js') },
      { path: '/z/backup', loader: () => import('./pages/backup.js') },
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
