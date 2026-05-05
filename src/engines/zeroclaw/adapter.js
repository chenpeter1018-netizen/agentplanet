/**
 * ZeroClaw 引擎适配器
 * 独立二进制，便携运维工具箱（安装/维护/修复/备份/知识库）
 */
function pageLoader(name) {
  return () => import(`../../pages/${name}.js`)
}

export default {
  id: 'zeroclaw',
  name: 'engine.zeroclaw',
  icon: '',
  description: 'engine.zeroclawDesc',

  detect() {
    return Promise.resolve({ installed: true, ready: true })
  },

  boot() { return Promise.resolve() },
  cleanup() {},

  getRoutes() {
    return [
      { path: '/zeroclaw/install', loader: pageLoader('setup') },
      { path: '/zeroclaw/maintain', loader: pageLoader('diagnose') },
      { path: '/zeroclaw/repair', loader: pageLoader('diagnose') },
      { path: '/zeroclaw/backup', loader: pageLoader('memory-files') },
      { path: '/zeroclaw/knowledge', loader: pageLoader('memory-optimize') },
    ]
  },

  getDefaultRoute() { return '/zeroclaw/install' },
  getSetupRoute() { return '/zeroclaw/install' },

  isReady() { return true },
  isGatewayRunning() { return false },

  onStateChange(fn) {
    window.addEventListener('zeroclaw-state-change', fn)
    return () => window.removeEventListener('zeroclaw-state-change', fn)
  },
  onReadyChange(fn) {
    window.addEventListener('zeroclaw-ready-change', fn)
    return () => window.removeEventListener('zeroclaw-ready-change', fn)
  },
}
