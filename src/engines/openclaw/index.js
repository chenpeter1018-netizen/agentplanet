/**
 * OpenClaw 引擎
 * 包装现有 OpenClaw 逻辑为统一的 Engine 接口，不改动原有代码
 */
import { detectOpenclawStatus, isOpenclawReady, isGatewayRunning, isGatewayForeign,
         onGatewayChange, startGatewayPoll, stopGatewayPoll, onReadyChange } from '../../lib/app-state.js'
import { initFeatureGates, isFeatureAvailable } from '../../lib/feature-gates.js'
import { t } from '../../lib/i18n.js'

export default {
  id: 'openclaw',
  name: 'OpenClaw',
  description: 'OpenClaw AI Agent Framework',
  icon: '<img src="/openclaw-icon.png" alt="OpenClaw" width="18" height="18" style="display:block;object-fit:contain">',

  /** 检测 OpenClaw 是否已安装 */
  async detect() {
    const ready = await detectOpenclawStatus()
    return { installed: ready, ready }
  },

  /** 启动 OpenClaw 引擎相关逻辑 */
  async boot() {
    await detectOpenclawStatus()
    await initFeatureGates().catch(() => {})
    startGatewayPoll()
  },

  /** 清理（停止轮询等） */
  cleanup() {
    stopGatewayPoll()
  },

  /** 侧边栏菜单项 */
  getNavItems() {
    if (!isOpenclawReady()) {
      return [{
        section: '',
        items: [
          { route: '/setup', label: t('sidebar.setup'), icon: 'setup' },
        ]
      }, {
        section: '',
        items: [
          { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
          { route: '/chat-debug', label: t('sidebar.chatDebug'), icon: 'debug' },
          { route: '/about', label: t('sidebar.about'), icon: 'about' },
        ]
      }]
    }
    return [
      { section: '', items: [
        { route: '/chat', label: t('sidebar.aiChat'), icon: 'chat' },
        { route: '/agents', label: t('sidebar.digitalEmployees'), icon: 'agents' },
        { route: '/cron', label: t('sidebar.cronJobs'), icon: 'clock' },
        { route: '/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
      ]},
      { section: '', divider: true, items: [
        { route: '/skills', label: t('sidebar.skills'), icon: 'skills', gate: 'skills' },
        { route: '/plugin-hub', label: t('sidebar.pluginHub'), icon: 'extensions' },
      ]},
      { section: t('sidebar.sectionSettings'), collapsed: true, id: 'settings-group', items: [
        { route: '/services', label: t('sidebar.engineManagement'), icon: 'services' },
        { route: '/models', label: t('sidebar.models'), icon: 'models' },
        { route: '/channels', label: t('sidebar.mobileConnect'), icon: 'channels' },
        { route: '/gateway', label: t('sidebar.gateway'), icon: 'gateway' },
        { route: '/communication', label: t('sidebar.communication'), icon: 'settings' },
        { route: '/security', label: t('sidebar.security'), icon: 'security' },
        { route: '/settings', label: t('sidebar.systemSettings'), icon: 'settings' },
        { route: '/chat-debug', label: t('sidebar.checkRepair'), icon: 'diagnose' },
      ]},
      { section: t('sidebar.sectionData'), collapsed: true, id: 'data', items: [
        { route: '/usage', label: t('sidebar.usage'), icon: 'bar-chart' },
        { route: '/memory', label: t('sidebar.memory'), icon: 'memory', gate: 'memory' },
        { route: '/dreaming', label: t('sidebar.memoryOptimization'), icon: 'dreaming', gate: 'dreaming' },
        { route: '/logs', label: t('sidebar.logs'), icon: 'logs' },
        { route: '/about', label: t('sidebar.about'), icon: 'about' },
      ]},
    ]
  },

  /** 路由注册表 */
  getRoutes() {
    return [
      { path: '/dashboard', loader: () => import('../../pages/dashboard.js') },
      { path: '/chat', loader: () => import('../../pages/chat.js') },
      { path: '/chat-debug', loader: () => import('../../pages/chat-debug.js') },
      { path: '/services', loader: () => import('../../pages/services.js') },
      { path: '/logs', loader: () => import('../../pages/logs.js') },
      { path: '/models', loader: () => import('../../pages/models.js') },
      { path: '/agents', loader: () => import('../../pages/digital-employees.js') },
      { path: '/agent-detail', loader: () => import('../../pages/agent-detail.js') },
      { path: '/gateway', loader: () => import('../../pages/gateway.js') },
      { path: '/memory', loader: () => import('../../pages/memory.js') },
      { path: '/dreaming', loader: () => import('../../pages/dreaming.js') },
      { path: '/skills', loader: () => import('../../pages/skills.js') },
      { path: '/security', loader: () => import('../../pages/security.js') },
      { path: '/about', loader: () => import('../../pages/about.js') },
      { path: '/assistant', loader: () => import('../../pages/assistant.js') },
      { path: '/setup', loader: () => import('../../pages/setup.js') },
      { path: '/channels', loader: () => import('../../pages/channels.js') },
      { path: '/cron', loader: () => import('../../pages/cron.js') },
      { path: '/usage', loader: () => import('../../pages/usage.js') },
      { path: '/communication', loader: () => import('../../pages/communication.js') },
      { path: '/settings', loader: () => import('../../pages/settings.js') },
      { path: '/plugin-hub', loader: () => import('../../pages/plugin-hub.js') },
      { path: '/diagnose', loader: () => import('../../pages/chat-debug.js') },
    ]
  },

  getSetupRoute() { return '/setup' },
  getDefaultRoute() { return '/dashboard' },

  isReady() { return isOpenclawReady() },
  isGatewayRunning() { return isGatewayRunning() },
  isGatewayForeign() { return isGatewayForeign() },

  onStateChange(fn) { return onGatewayChange(fn) },
  onReadyChange(fn) { return onReadyChange(fn) },

  /** 功能门控：基于 OpenClaw 版本号 */
  isFeatureAvailable(featureId) { return isFeatureAvailable(featureId) },
}
