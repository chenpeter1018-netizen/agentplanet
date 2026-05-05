/**
 * Agent Planet 路由拓扑页面
 * 智能体路由 + 渠道路由 + 模型路由 + 回退策略
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'

let _el = null
let _routes = { agents: [], channels: [], models: [], fallback: null }

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('routeTopology.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-secondary" data-action="rt-reload">${tl('common.refresh')}</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('routeTopology.agentRoutes')}</div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('digitalWorkers.agentName')}</th>
                <th>${tl('modelConfig.modelId')}</th>
                <th>${tl('routeTopology.channelRoutes')}</th>
                <th>${tl('routeTopology.fallbackBehavior')}</th>
              </tr>
            </thead>
            <tbody id="rt-agent-body">
              <tr><td colspan="4"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('routeTopology.channelRoutes')}</div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('phoneLink.pairingChannel')}</th>
                <th>${tl('gateway.mode')}</th>
                <th>${tl('cronJobs.status')}</th>
                <th>${tl('routeTopology.fallbackBehavior')}</th>
              </tr>
            </thead>
            <tbody id="rt-channel-body">
              <tr><td colspan="4"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${tl('routeTopology.fallbackBehavior')}</div>
      <div class="card-body" id="rt-fallback">
        <div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>
      </div>
    </div>
  `

  bindEvents(_el)
  loadRoutes()
  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    if (btn.dataset.action === 'rt-reload') loadRoutes()
  })
}

async function loadRoutes() {
  try {
    _routes = await bridge.getRouteTopology() || {}
  } catch {
    _routes = { agents: [], channels: [], models: [], fallback: null }
  }
  renderAll()
}

function renderAll() {
  renderAgentRoutes()
  renderChannelRoutes()
  renderFallback()
}

function renderAgentRoutes() {
  const tbody = _el.querySelector('#rt-agent-body')
  if (!tbody) return
  const agents = _routes.agents || []

  if (!agents.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div></td>`
    return
  }

  tbody.innerHTML = agents.map(a => `
    <tr>
      <td style="font-weight:500">${escHtml(a.name || a.id)}</td>
      <td><code style="font-size:var(--font-size-xs)">${escHtml(a.model || '-')}</code></td>
      <td style="font-size:var(--font-size-xs)">${escHtml((a.channels || []).join(', ') || '-')}</td>
      <td><span class="badge badge-info">${escHtml(a.fallback || 'default')}</span></td>
    </tr>
  `).join('')
}

function renderChannelRoutes() {
  const tbody = _el.querySelector('#rt-channel-body')
  if (!tbody) return
  const channels = _routes.channels || []

  if (!channels.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div></td>`
    return
  }

  tbody.innerHTML = channels.map(c => `
    <tr>
      <td style="font-weight:500">${escHtml(c.name || c.id)}</td>
      <td><span class="badge badge-info">${escHtml(c.mode || 'local')}</span></td>
      <td><span class="badge ${c.enabled !== false ? 'badge-success' : 'badge-error'}">${c.enabled !== false ? tl('pluginHub.enabled') : tl('pluginHub.disabled')}</span></td>
      <td style="font-size:var(--font-size-xs)">${escHtml(c.fallback || 'default')}</td>
    </tr>
  `).join('')
}

function renderFallback() {
  const container = _el.querySelector('#rt-fallback')
  if (!container) return
  const fb = _routes.fallback

  if (!fb) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>`
    return
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;font-size:var(--font-size-sm)">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <span style="color:var(--text-tertiary)">${tl('modelConfig.modelId')}</span>
        <span style="font-weight:500">${escHtml(fb.defaultModel || '-')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <span style="color:var(--text-tertiary)">${tl('routeTopology.fallbackBehavior')}</span>
        <span style="font-weight:500">${escHtml(fb.strategy || 'round-robin')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <span style="color:var(--text-tertiary)">${tl('cronJobs.retry')}</span>
        <span style="font-weight:500">${fb.maxRetries || 3}</span>
      </div>
    </div>
  `
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

export function cleanup() { _el = null; _routes = {} }
