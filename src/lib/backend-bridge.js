/**
 * Agent Planet 后端桥接层
 * Tauri 环境用 invoke，Web 模式走 dev-api 后端
 * 缓存层：15s TTL，in-flight 去重，写操作自动失效
 */
import { tl } from './language.js'

export function isTauriRuntime() {
  return !!window.__TAURI_INTERNALS__ || !!window.__TAURI__ || window.location?.hostname === 'tauri.localhost'
}

// Web 模式专属命令（Tauri Rust 不处理）
const WEB_ONLY_CMDS = new Set([
  'instance_list', 'instance_add', 'instance_remove', 'instance_set_active',
  'instance_health_check', 'instance_health_all',
  'docker_info', 'docker_list_containers', 'docker_create_container',
  'docker_start_container', 'docker_stop_container', 'docker_restart_container',
  'docker_remove_container', 'docker_pull_image', 'docker_pull_status',
  'docker_list_images', 'docker_list_nodes', 'docker_add_node',
  'docker_remove_node', 'docker_cluster_overview',
  'get_deploy_mode',
])

let _invokeReady = null

async function getTauriInvoke() {
  if (!isTauriRuntime()) return null
  if (!_invokeReady) {
    _invokeReady = import('@tauri-apps/api/core').then(m => m.invoke)
  }
  return _invokeReady
}

// 缓存层
const _cache = new Map()
const _inflight = new Map()
const CACHE_TTL = 15000

const _requestLogs = []
const MAX_LOGS = 100

function logRequest(cmd, args, duration, cached = false) {
  const log = {
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false, fractionalSecondDigits: 3 }),
    cmd,
    args: JSON.stringify(args),
    duration: duration ? `${duration}ms` : '-',
    cached
  }
  _requestLogs.push(log)
  if (_requestLogs.length > MAX_LOGS) _requestLogs.shift()
}

export function getRequestLogs() { return _requestLogs.slice() }
export function clearRequestLogs() { _requestLogs.length = 0 }

function cachedInvoke(cmd, args = {}, ttl = CACHE_TTL) {
  const key = cmd + JSON.stringify(args)
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.ts < ttl) {
    logRequest(cmd, args, 0, true)
    return Promise.resolve(cached.val)
  }
  if (_inflight.has(key)) {
    return _inflight.get(key)
  }
  const p = invoke(cmd, args).then(val => {
    _cache.set(key, { val, ts: Date.now() })
    _inflight.delete(key)
    return val
  }).catch(err => {
    _inflight.delete(key)
    throw err
  })
  _inflight.set(key, p)
  return p
}

export function invalidate(...cmds) {
  if (!cmds.length) {
    _cache.clear()
    _inflight.clear()
    return
  }
  for (const [k] of _cache) {
    if (cmds.some(c => k.startsWith(c))) _cache.delete(k)
  }
  for (const [k] of _inflight) {
    if (cmds.some(c => k.startsWith(c))) _inflight.delete(k)
  }
}

async function invoke(cmd, args = {}) {
  const start = Date.now()
  const tauriInvoke = WEB_ONLY_CMDS.has(cmd) ? null : await getTauriInvoke()
  if (tauriInvoke) {
    const result = await tauriInvoke(cmd, args)
    logRequest(cmd, args, Date.now() - start, false)
    return result
  }
  const result = await webInvoke(cmd, args)
  logRequest(cmd, args, Date.now() - start, false)
  return result
}

async function webInvoke(cmd, args) {
  const resp = await fetch(`/__api/${cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (resp.status === 401) {
    if (!isTauriRuntime() && window.__agentplanet_show_login) window.__agentplanet_show_login()
    throw new Error(tl('common.loginRequired'))
  }
  const ct = (resp.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('text/html') || ct.includes('text/plain')) {
    throw new Error(tl('common.backendWebModeRequired'))
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error(data.error || `HTTP ${resp.status}`)
  }
  return resp.json()
}

// 后端连接状态
let _backendOnline = null
const _backendListeners = []

export function onBackendStatusChange(fn) {
  _backendListeners.push(fn)
  return () => { const i = _backendListeners.indexOf(fn); if (i >= 0) _backendListeners.splice(i, 1) }
}
export function isBackendOnline() { return _backendOnline }

function setBackendOnline(v) {
  if (_backendOnline !== v) {
    _backendOnline = v
    _backendListeners.forEach(fn => { try { fn(v) } catch {} })
  }
}

export async function checkBackendHealth() {
  if (isTauriRuntime()) { setBackendOnline(true); return true }
  try {
    const resp = await fetch('/__api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const ok = resp.ok
    setBackendOnline(ok)
    return ok
  } catch {
    setBackendOnline(false)
    return false
  }
}

// 配置保存后防抖重载 Gateway
let _reloadTimer = null
function debouncedReloadGateway() {
  clearTimeout(_reloadTimer)
  _reloadTimer = setTimeout(() => { invoke('reload_gateway').catch(() => {}) }, 3000)
}

// 导出桥接 API
export const bridge = {
  // 服务管理
  getServicesStatus: () => cachedInvoke('get_services_status', {}, 10000),
  startService: (label) => { invalidate('get_services_status'); return invoke('start_service', { label }) },
  stopService: (label) => { invalidate('get_services_status'); return invoke('stop_service', { label }) },
  restartService: (label) => { invalidate('get_services_status'); return invoke('restart_service', { label }) },
  claimGateway: () => { invalidate('get_services_status'); return invoke('claim_gateway') },
  probeGatewayPort: () => invoke('probe_gateway_port'),
  diagnoseGatewayConnection: () => invoke('diagnose_gateway_connection'),
  guardianStatus: () => invoke('guardian_status'),

  // 配置
  getVersionInfo: () => cachedInvoke('get_version_info', {}, 30000),
  getStatusSummary: () => cachedInvoke('get_status_summary', {}, 60000),
  readEngineConfig: () => cachedInvoke('read_openclaw_config'),
  calibrateEngineConfig: (mode = 'inherit') => { invalidate('read_openclaw_config', 'check_installation', 'list_backups', 'get_services_status', 'get_status_summary'); return invoke('calibrate_openclaw_config', { mode }).then(r => { debouncedReloadGateway(); return r }) },
  writeEngineConfig: (config) => { invalidate('read_openclaw_config'); return invoke('write_openclaw_config', { config }).then(r => { debouncedReloadGateway(); return r }) },
  readMcpConfig: () => cachedInvoke('read_mcp_config'),
  writeMcpConfig: (config) => { invalidate('read_mcp_config'); return invoke('write_mcp_config', { config }) },
  reloadGateway: () => invoke('reload_gateway'),
  restartGateway: () => invoke('restart_gateway'),
  doctorCheck: () => invoke('doctor_check'),
  doctorFix: () => invoke('doctor_fix'),
  listVersions: (source = 'chinese') => invoke('list_openclaw_versions', { source }),
  upgradeEngine: (source = 'chinese', version = null, method = 'auto') => {
    invalidate('check_installation', 'check_node', 'check_git', 'get_services_status', 'get_status_summary', 'get_version_info')
    return invoke('upgrade_openclaw', { source, version, method })
  },
  uninstallEngine: (cleanConfig = false) => {
    invalidate('check_installation', 'check_node', 'check_git', 'get_services_status', 'get_status_summary', 'get_version_info')
    return invoke('uninstall_openclaw', { cleanConfig })
  },
  installGateway: () => { invalidate('get_services_status', 'get_status_summary'); return invoke('install_gateway') },
  uninstallGateway: () => { invalidate('get_services_status', 'get_status_summary'); return invoke('uninstall_gateway') },
  getNpmRegistry: () => cachedInvoke('get_npm_registry', {}, 30000),
  setNpmRegistry: (registry) => { invalidate('get_npm_registry'); return invoke('set_npm_registry', { registry }) },
  testModel: (baseUrl, apiKey, modelId, apiType = null) => invoke('test_model', { baseUrl, apiKey, modelId, apiType }),
  testModelVerbose: (baseUrl, apiKey, modelId, apiType = null) => invoke('test_model_verbose', { baseUrl, apiKey, modelId, apiType }),
  listRemoteModels: (baseUrl, apiKey, apiType = null) => invoke('list_remote_models', { baseUrl, apiKey, apiType }),

  // Agent 管理
  listAgents: () => cachedInvoke('list_agents'),
  getAgentDetail: (id) => cachedInvoke('get_agent_detail', { id }, 5000),
  listAgentFiles: (id) => cachedInvoke('list_agent_files', { id }, 5000),
  readAgentFile: (id, name) => invoke('read_agent_file', { id, name }),
  writeAgentFile: (id, name, content) => { invalidate('list_agent_files', 'read_agent_file'); return invoke('write_agent_file', { id, name, content }) },
  getAgentWorkspaceInfo: (id) => cachedInvoke('get_agent_workspace_info', { id }, 5000),
  listAgentWorkspaceEntries: (id, relativePath) => cachedInvoke('list_agent_workspace_entries', { id, relativePath: relativePath || null }, 5000),
  readAgentWorkspaceFile: (id, relativePath) => cachedInvoke('read_agent_workspace_file', { id, relativePath }, 5000),
  writeAgentWorkspaceFile: (id, relativePath, content) => {
    invalidate('get_agent_workspace_info', 'list_agent_workspace_entries', 'read_agent_workspace_file', 'list_agent_files', 'read_agent_file')
    return invoke('write_agent_workspace_file', { id, relativePath, content })
  },
  updateAgentConfig: (id, config) => { invalidate('list_agents', 'get_agent_detail'); return invoke('update_agent_config', { id, config }) },
  addAgent: (name, model, workspace) => { invalidate('list_agents'); return invoke('add_agent', { name, model, workspace: workspace || null }) },
  deleteAgent: (id) => { invalidate('list_agents', 'get_agent_detail'); return invoke('delete_agent', { id }) },
  updateAgentIdentity: (id, name, emoji) => { invalidate('list_agents', 'get_agent_detail'); return invoke('update_agent_identity', { id, name, emoji }) },
  updateAgentModel: (id, model) => { invalidate('list_agents', 'get_agent_detail'); return invoke('update_agent_model', { id, model }) },
  backupAgent: (id) => invoke('backup_agent', { id }),

  // 日志
  readLogTail: (logName, lines = 100) => cachedInvoke('read_log_tail', { logName, lines }, 5000),
  searchLog: (logName, query, maxResults = 50) => invoke('search_log', { logName, query, maxResults }),

  // 记忆文件
  listMemoryFiles: (category, agentId) => cachedInvoke('list_memory_files', { category, agentId: agentId || null }),
  readMemoryFile: (path, agentId) => cachedInvoke('read_memory_file', { path, agentId: agentId || null }, 5000),
  writeMemoryFile: (path, content, category, agentId) => { invalidate('list_memory_files', 'read_memory_file'); return invoke('write_memory_file', { path, content, category: category || 'memory', agentId: agentId || null }) },
  deleteMemoryFile: (path, agentId) => { invalidate('list_memory_files'); return invoke('delete_memory_file', { path, agentId: agentId || null }) },
  exportMemoryZip: (category, agentId) => invoke('export_memory_zip', { category, agentId: agentId || null }),

  // 消息渠道
  readPlatformConfig: (platform, accountId) => invoke('read_platform_config', { platform, accountId: accountId || null }),
  saveMessagingPlatform: (platform, form, accountId, agentId) => { invalidate('list_configured_platforms', 'read_openclaw_config', 'read_platform_config'); return invoke('save_messaging_platform', { platform, form, accountId: accountId || null, agentId: agentId || null }) },
  removeMessagingPlatform: (platform, accountId) => { invalidate('list_configured_platforms', 'read_openclaw_config', 'read_platform_config'); return invoke('remove_messaging_platform', { platform, accountId: accountId || null }) },
  toggleMessagingPlatform: (platform, enabled) => { invalidate('list_configured_platforms', 'read_openclaw_config', 'read_platform_config'); return invoke('toggle_messaging_platform', { platform, enabled }) },
  verifyBotToken: (platform, form) => invoke('verify_bot_token', { platform, form }),
  diagnoseChannel: (platform, accountId) => invoke('diagnose_channel', { platform, accountId: accountId || null }),
  listConfiguredPlatforms: () => cachedInvoke('list_configured_platforms', {}, 5000),
  listAllPlugins: () => cachedInvoke('list_all_plugins', {}, 5000),
  togglePlugin: (pluginId, enabled) => { invalidate('list_all_plugins'); return invoke('toggle_plugin', { pluginId, enabled }) },
  installPlugin: (packageName) => { invalidate('list_all_plugins'); return invoke('install_plugin', { packageName }) },

  // Agent 渠道绑定
  getAgentBindings: (agentId) => invoke('get_agent_bindings', { agentId }),
  listAllBindings: () => invoke('list_all_bindings'),
  saveAgentBinding: (agentId, channel, accountId, bindingConfig) => { invalidate('read_openclaw_config', 'list_configured_platforms'); return invoke('save_agent_binding', { agentId, channel, accountId: accountId || null, bindingConfig: bindingConfig || {} }) },
  deleteAgentBinding: (agentId, channel, accountId, bindingConfig) => { invalidate('read_openclaw_config', 'list_configured_platforms'); return invoke('delete_agent_binding', { agentId, channel, accountId: accountId || null, bindingConfig: bindingConfig || null }) },

  // 面板配置
  getEngineDir: () => invoke('get_openclaw_dir'),
  relaunchApp: () => {
    if (!isTauriRuntime()) { try { window.location.reload() } catch {}; return Promise.resolve({ ok: true, mode: 'web-reload' }) }
    return invoke('relaunch_app')
  },
  readPanelConfig: () => invoke('read_panel_config'),
  writePanelConfig: (config) => { invalidate(); return invoke('write_panel_config', { config }).then(r => { invoke('invalidate_path_cache').catch(() => {}); return r }) },
  testProxy: (url) => invoke('test_proxy', { url: url || null }),

  // 安装/部署
  checkInstallation: () => cachedInvoke('check_installation', {}, 60000),
  initEngineConfig: () => { invalidate('check_installation'); return invoke('init_openclaw_config') },
  checkNode: () => cachedInvoke('check_node', {}, 60000),
  checkNodeAtPath: (nodeDir) => invoke('check_node_at_path', { nodeDir }),
  checkEngineAtPath: (cliPath) => invoke('check_openclaw_at_path', { cliPath }),
  scanNodePaths: () => invoke('scan_node_paths'),
  scanEnginePaths: () => invoke('scan_openclaw_paths'),
  saveCustomNodePath: (nodeDir) => invoke('save_custom_node_path', { nodeDir }).then(r => { invalidate('check_node', 'get_services_status'); invoke('invalidate_path_cache').catch(() => {}); return r }),
  invalidatePathCache: () => invoke('invalidate_path_cache'),
  checkGit: () => cachedInvoke('check_git', {}, 60000),
  scanGitPaths: () => invoke('scan_git_paths'),
  autoInstallGit: () => invoke('auto_install_git'),
  configureGitHttps: () => invoke('configure_git_https'),
  patchModelVision: () => invoke('patch_model_vision'),

  // 备份管理
  listBackups: () => cachedInvoke('list_backups'),
  createBackup: () => { invalidate('list_backups'); return invoke('create_backup') },
  restoreBackup: (name) => invoke('restore_backup', { name }),
  deleteBackup: (name) => { invalidate('list_backups'); return invoke('delete_backup', { name }) },

  // 设备密钥 + Gateway 握手
  createConnectFrame: (nonce, gatewayToken, gatewayPassword) => invoke('create_connect_frame', { nonce, gatewayToken, gatewayPassword: gatewayPassword || null }),

  // 设备配对
  autoPairDevice: () => invoke('auto_pair_device'),
  checkPairingStatus: () => invoke('check_pairing_status'),
  pairingListChannel: (channel) => invoke('pairing_list_channel', { channel }),
  pairingApproveChannel: (channel, code, notify = false) => invoke('pairing_approve_channel', { channel, code, notify }),

  // Skills 管理
  skillsList: (agentId) => invoke('skills_list', { agent_id: agentId || null }),
  skillsInfo: (name, agentId) => invoke('skills_info', { name, agent_id: agentId || null }),
  skillsCheck: () => invoke('skills_check'),
  skillsInstallDep: (kind, spec) => invoke('skills_install_dep', { kind, spec }),
  skillsUninstall: (name, agentId) => invoke('skills_uninstall', { name, agent_id: agentId || null }),
  skillhubSearch: (query, limit) => invoke('skillhub_search', { query, limit }),
  skillhubIndex: () => invoke('skillhub_index'),
  skillhubInstall: (slug, agentId) => invoke('skillhub_install', { slug, agent_id: agentId || null }),

  // 实例管理
  instanceList: () => cachedInvoke('instance_list', {}, 10000),
  instanceAdd: (instance) => { invalidate('instance_list'); return invoke('instance_add', instance) },
  instanceRemove: (id) => { invalidate('instance_list'); return invoke('instance_remove', { id }) },
  instanceSetActive: (id) => { invalidate('instance_list'); _cache.clear(); return invoke('instance_set_active', { id }) },
  instanceHealthCheck: (id) => invoke('instance_health_check', { id }),
  instanceHealthAll: () => invoke('instance_health_all'),

  // 前端热更新
  checkFrontendUpdate: () => invoke('check_frontend_update'),
  downloadFrontendUpdate: (url, expectedHash, version) => invoke('download_frontend_update', { url, expectedHash: expectedHash || '', version: version || '' }),
  rollbackFrontendUpdate: () => invoke('rollback_frontend_update'),
  getUpdateStatus: () => invoke('get_update_status'),

  // Hermes Agent 管理
  checkPython: () => cachedInvoke('check_python', {}, 60000),
  checkHermes: () => cachedInvoke('check_hermes', {}, 30000),
  installHermes: (method = 'uv-tool', extras = []) => invoke('install_hermes', { method, extras }),
  configureHermes: (provider, apiKey, model, baseUrl) => invoke('configure_hermes', { provider, apiKey, model: model || null, baseUrl: baseUrl || null }),
  hermesGatewayAction: (action) => invoke('hermes_gateway_action', { action }),
  hermesHealthCheck: () => invoke('hermes_health_check'),
  hermesApiProxy: (method, path, body, headers) => invoke('hermes_api_proxy', { method, path, body: body || null, headers: headers || null }),
  hermesAgentRun: (input, sessionId, conversationHistory, instructions) => invoke('hermes_agent_run', { input, sessionId: sessionId || null, conversationHistory: conversationHistory || null, instructions: instructions || null }),
  hermesReadConfig: () => invoke('hermes_read_config'),
  hermesFetchModels: (baseUrl, apiKey, apiType, provider) => invoke('hermes_fetch_models', { baseUrl, apiKey, apiType: apiType || null, provider: provider || null }),
  hermesUpdateModel: (model, provider) => invoke('hermes_update_model', { model, provider: provider || null }),
  hermesListProviders: () => cachedInvoke('hermes_list_providers', {}, 600000),
  updateHermes: () => invoke('update_hermes'),
  uninstallHermes: (cleanConfig = false) => invoke('uninstall_hermes', { cleanConfig }),

  // Hermes Sessions / Logs / Skills / Memory
  hermesSessionsList: (source, limit, profile) => invoke('hermes_sessions_list', { source: source || null, limit: limit || null, profile: profile || null }),
  hermesSessionsSummaryList: (source, limit, profile) => invoke('hermes_sessions_summary_list', { source: source || null, limit: limit || null, profile: profile || null }),
  hermesUsageAnalytics: (days, profile) => invoke('hermes_usage_analytics', { days: days || 30, profile: profile || null }),
  hermesSessionDetail: (sessionId, profile) => invoke('hermes_session_detail', { sessionId, profile: profile || null }),
  hermesSessionDelete: (sessionId, profile) => invoke('hermes_session_delete', { sessionId, profile: profile || null }),
  hermesSessionRename: (sessionId, title, profile) => invoke('hermes_session_rename', { sessionId, title, profile: profile || null }),
  hermesProfilesList: () => invoke('hermes_profiles_list'),
  hermesLogsList: () => invoke('hermes_logs_list'),
  hermesLogsRead: (name, lines, level) => invoke('hermes_logs_read', { name, lines: lines || 200, level: level || null }),
  hermesCronJobsList: () => invoke('hermes_cron_jobs_list'),
  hermesSkillsList: () => invoke('hermes_skills_list'),
  hermesMemoryRead: (type) => invoke('hermes_memory_read', { type: type || 'memory' }),
  hermesMemoryWrite: (type, content) => invoke('hermes_memory_write', { type: type || 'memory', content }),
  hermesMemoryReadAll: () => invoke('hermes_memory_read_all'),
}
