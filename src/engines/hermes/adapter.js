/**
 * Hermes Agent 引擎适配器
 * 独立 Gateway，Python 环境，路由前缀 /hermes-*
 */
import { bridge } from '../../lib/backend-bridge.js'

function pageLoader(name) {
  return () => import(`../../pages/${name}.js`)
}

export default {
  id: 'hermes',
  name: 'engine.hermes',
  icon: '',
  description: 'engine.hermesDesc',

  async detect() {
    try {
      const [python, hermes] = await Promise.all([
        bridge.checkPython().catch(() => ({ installed: false })),
        bridge.checkHermes().catch(() => ({ installed: false })),
      ])
      return { installed: !!(python?.installed && hermes?.installed), ready: !!hermes?.running }
    } catch {
      return { installed: false, ready: false }
    }
  },

  async boot() {
    await Promise.all([
      bridge.checkPython().catch(() => {}),
      bridge.checkHermes().catch(() => {}),
    ])
  },

  cleanup() {},

  getRoutes() {
    return [
      { path: '/hermes-dashboard', loader: pageLoader('dashboard') },
      { path: '/hermes-chat', loader: pageLoader('chat') },
      { path: '/hermes-sessions', loader: pageLoader('cron-jobs') },
      { path: '/hermes-model', loader: pageLoader('model-config') },
      { path: '/hermes-skills', loader: pageLoader('skills') },
      { path: '/hermes-cron', loader: pageLoader('cron-jobs') },
      { path: '/hermes-logs', loader: pageLoader('log-viewer') },
    ]
  },

  getDefaultRoute() { return '/hermes-dashboard' },
  getSetupRoute() { return '/hermes-setup' },

  isReady() { return false },
  isGatewayRunning() { return false },

  onStateChange(fn) {
    window.addEventListener('hermes-state-change', fn)
    return () => window.removeEventListener('hermes-state-change', fn)
  },
  onReadyChange(fn) {
    window.addEventListener('hermes-ready-change', fn)
    return () => window.removeEventListener('hermes-ready-change', fn)
  },
}
