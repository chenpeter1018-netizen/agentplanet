/**
 * Agent Planet 运行状态页面
 * 系统信息 + 进程信息 + 资源使用 + 网络状态
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { isEngineReady, isGatewayRunning } from '../lib/app-core.js'
import { realtimeHub } from '../lib/realtime-client.js'

let _el = null
let _pollTimer = null
let _status = {}

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('runtimeStatus.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-secondary" data-action="rt-refresh">${tl('common.refresh')}</button>
    </div>

    <div class="stats-grid" id="rt-stats">
      <div class="stat-card"><div class="stat-card-label">${tl('dashboard.engineStatus')}</div><div class="stat-card-value" id="rt-engine">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('runtimeStatus.gatewayPort')}</div><div class="stat-card-value" id="rt-gateway">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('runtimeStatus.wsConnected')}</div><div class="stat-card-value" id="rt-ws">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('dashboard.cpuUsage')}</div><div class="stat-card-value" id="rt-cpu">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('dashboard.memUsage')}</div><div class="stat-card-value" id="rt-mem">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('dashboard.uptime')}</div><div class="stat-card-value" id="rt-uptime">-</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('runtimeStatus.systemInfo')}</div>
      <div class="card-body" id="rt-system-info">
        <div class="page-loader"><div class="page-loader-spinner"></div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('runtimeStatus.eventLog')}</div>
      <div class="card-body" id="rt-events" style="max-height:300px;overflow-y:auto;padding:12px 16px">
        <div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>
      </div>
    </div>
  `

  bindEvents(_el)
  refreshStatus()
  startPoll()

  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    if (btn.dataset.action === 'rt-refresh') refreshStatus()
  })
}

async function refreshStatus() {
  try {
    _status = await bridge.getSystemStatus() || {}
  } catch {
    _status = {}
  }

  const engineReady = isEngineReady()
  const gwRunning = isGatewayRunning()

  const elEngine = _el.querySelector('#rt-engine')
  const elGateway = _el.querySelector('#rt-gateway')
  const elWs = _el.querySelector('#rt-ws')
  const elCpu = _el.querySelector('#rt-cpu')
  const elMem = _el.querySelector('#rt-mem')
  const elUptime = _el.querySelector('#rt-uptime')

  if (elEngine) elEngine.textContent = engineReady ? tl('engine.ready') : tl('engine.notInstalled')
  if (elGateway) elGateway.textContent = gwRunning ? `${_status.gatewayPort || 18789} ✓` : tl('dashboard.gatewayStopped')
  if (elWs) elWs.textContent = realtimeHub.connected ? tl('runtimeStatus.wsConnected') : tl('runtimeStatus.wsDisconnected')
  if (elCpu) elCpu.textContent = _status.cpuUsage || '-'
  if (elMem) elMem.textContent = _status.memUsage || '-'
  if (elUptime) elUptime.textContent = _status.uptime ? formatUptime(_status.uptime) : '-'

  renderSystemInfo()
}

function renderSystemInfo() {
  const container = _el.querySelector('#rt-system-info')
  if (!container) return

  const info = [
    { label: 'Platform', value: _status.platform || navigator.platform },
    { label: 'Node.js', value: _status.nodeVersion || '-' },
    { label: 'Gateway PID', value: _status.gatewayPid || '-' },
    { label: 'Agent Planet', value: 'v1.0.0' },
    { label: tl('runtimeStatus.agentStatus'), value: `${_status.agentCount || 0} ${tl('usage.activeAgents')}` },
    { label: tl('runtimeStatus.taskQueue'), value: `${_status.taskQueueSize || 0}` },
  ]

  container.innerHTML = info.map(i => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light);font-size:var(--font-size-sm)">
      <span style="color:var(--text-tertiary)">${i.label}</span>
      <span style="font-weight:500">${escHtml(i.value)}</span>
    </div>
  `).join('')
}

function startPoll() {
  _pollTimer = setInterval(refreshStatus, 10000)
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

export function cleanup() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  _el = null
}
