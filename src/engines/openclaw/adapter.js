/**
 * OpenClaw 引擎适配器
 * Gateway 端口 18789，包含全部 20+ 页面路由
 */
import { bridge } from '../../lib/backend-bridge.js'
import { tl } from '../../lib/language.js'

const ROUTE_PREFIX = ''

function pageLoader(name) {
  return () => import(`../../pages/${name}.js`)
}

export default {
  id: 'openclaw',
  name: 'engine.openclaw',
  icon: '',
  description: 'engine.openclawDesc',

  async detect() {
    try {
      const status = await bridge.checkInstallation()
      return { installed: status?.cli_installed || false, ready: status?.ready || false }
    } catch {
      return { installed: false, ready: false }
    }
  },

  async boot() {
    await bridge.checkInstallation().catch(() => {})
  },

  cleanup() {},

  getNavItems() {
    return [
      { id: `${ROUTE_PREFIX}/dashboard`, icon: 'dashboard', label: 'sidebar.dashboard' },
      { id: `${ROUTE_PREFIX}/chat`, icon: 'chat', label: 'sidebar.chat' },
      { id: `${ROUTE_PREFIX}/digital-workers`, icon: 'digitalWorkers', label: 'sidebar.digitalWorkers' },
      { id: `${ROUTE_PREFIX}/cron-jobs`, icon: 'cronJobs', label: 'sidebar.cronJobs' },
      { id: `${ROUTE_PREFIX}/runtime-status`, icon: 'runtimeStatus', label: 'sidebar.runtimeStatus' },
    ]
  },

  getRoutes() {
    return [
      { path: `${ROUTE_PREFIX}/dashboard`, loader: pageLoader('dashboard') },
      { path: `${ROUTE_PREFIX}/chat`, loader: pageLoader('chat') },
      { path: `${ROUTE_PREFIX}/digital-workers`, loader: pageLoader('digital-workers') },
      { path: `${ROUTE_PREFIX}/worker-market`, loader: pageLoader('worker-market') },
      { path: `${ROUTE_PREFIX}/cron-jobs`, loader: pageLoader('cron-jobs') },
      { path: `${ROUTE_PREFIX}/runtime-status`, loader: pageLoader('runtime-status') },
      { path: `${ROUTE_PREFIX}/skills`, loader: pageLoader('skills') },
      { path: `${ROUTE_PREFIX}/plugin-hub`, loader: pageLoader('plugin-hub') },
      { path: `${ROUTE_PREFIX}/services`, loader: pageLoader('services') },
      { path: `${ROUTE_PREFIX}/model-config`, loader: pageLoader('model-config') },
      { path: `${ROUTE_PREFIX}/phone-link`, loader: pageLoader('phone-link') },
      { path: `${ROUTE_PREFIX}/route-topology`, loader: pageLoader('route-topology') },
      { path: `${ROUTE_PREFIX}/gateway`, loader: pageLoader('gateway') },
      { path: `${ROUTE_PREFIX}/security`, loader: pageLoader('security') },
      { path: `${ROUTE_PREFIX}/settings`, loader: pageLoader('settings') },
      { path: `${ROUTE_PREFIX}/diagnose`, loader: pageLoader('diagnose') },
      { path: `${ROUTE_PREFIX}/usage`, loader: pageLoader('usage') },
      { path: `${ROUTE_PREFIX}/memory-files`, loader: pageLoader('memory-files') },
      { path: `${ROUTE_PREFIX}/memory-optimize`, loader: pageLoader('memory-optimize') },
      { path: `${ROUTE_PREFIX}/log-viewer`, loader: pageLoader('log-viewer') },
      { path: `${ROUTE_PREFIX}/about`, loader: pageLoader('about') },
      { path: `${ROUTE_PREFIX}/login`, loader: pageLoader('login') },
      { path: `${ROUTE_PREFIX}/setup`, loader: pageLoader('setup') },
    ]
  },

  getDefaultRoute() { return `${ROUTE_PREFIX}/dashboard` },
  getSetupRoute() { return `${ROUTE_PREFIX}/setup` },

  isReady() {
    try { return window.__engineReady_openclaw || false } catch { return false }
  },
  isGatewayRunning() {
    try { return window.__gatewayRunning || false } catch { return false }
  },

  onStateChange(fn) {
    window.addEventListener('openclaw-state-change', fn)
    return () => window.removeEventListener('openclaw-state-change', fn)
  },
  onReadyChange(fn) {
    window.addEventListener('openclaw-ready-change', fn)
    return () => window.removeEventListener('openclaw-ready-change', fn)
  },
}
