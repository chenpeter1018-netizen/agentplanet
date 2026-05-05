/**
 * Agent Planet 数字员工中心
 * Agent 管理标签页：增删改查 + 工作区
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

let _el = null
let _agents = []
let _activeTab = 'agents'

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('digitalWorkers.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-primary" data-action="agent-add">${tl('digitalWorkers.addAgent')}</button>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="agents">${tl('digitalWorkers.agentManage')}</button>
      <button class="tab" data-tab="market">${tl('digitalWorkers.workerMarket')}</button>
    </div>

    <div id="dw-content">
      <div class="page-loader"><div class="page-loader-spinner"></div></div>
    </div>
  `

  bindEvents(_el)
  loadAgents()

  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]')
    if (tab) {
      _activeTab = tab.dataset.tab
      el.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      if (_activeTab === 'market') {
        import('./worker-market.js').then(m => m.renderMarket(el.querySelector('#dw-content')))
      } else {
        renderAgentList()
      }
      return
    }

    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action

    if (action === 'agent-add') showAgentForm()
    else if (action === 'agent-edit') editAgent(btn.dataset.id)
    else if (action === 'agent-delete') deleteAgent(btn.dataset.id)
    else if (action === 'agent-files') openFileManager(btn.dataset.id)
    else if (action === 'agent-backup') backupAgent(btn.dataset.id)
    else if (action === 'agent-refresh') loadAgents()
  })
}

async function loadAgents() {
  try {
    _agents = await bridge.listAgents() || []
  } catch {
    _agents = []
  }
  if (_activeTab === 'agents') renderAgentList()
}

function renderAgentList() {
  const container = _el.querySelector('#dw-content')
  if (!container) return

  if (!_agents.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${tl('digitalWorkers.noAgents')}</div></div>`
    return
  }

  container.innerHTML = _agents.map(a => `
    <div class="card" style="margin-bottom:12px">
      <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">${escHtml(a.emoji || '🤖')}</div>
          <div>
            <div style="font-weight:600;font-size:var(--font-size-base)">${escHtml(a.name || a.id)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">
              ${escHtml(a.model || '-')} · ${escHtml(a.workspace || 'default')}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" data-action="agent-files" data-id="${escAttr(a.id)}">${tl('digitalWorkers.fileManager')}</button>
          <button class="btn btn-sm btn-secondary" data-action="agent-backup" data-id="${escAttr(a.id)}">${tl('digitalWorkers.backupAgent')}</button>
          <button class="btn btn-sm btn-ghost" data-action="agent-edit" data-id="${escAttr(a.id)}">${tl('common.edit')}</button>
          <button class="btn btn-sm btn-ghost" data-action="agent-delete" data-id="${escAttr(a.id)}" style="color:var(--error)">${tl('common.delete')}</button>
        </div>
      </div>
    </div>
  `).join('')
}

function showAgentForm(agent) {
  const isEdit = agent != null
  const a = agent || { id: '', name: '', emoji: '🤖', model: '', workspace: 'default' }

  showModal({
    title: isEdit ? tl('digitalWorkers.editAgent') : tl('digitalWorkers.addAgent'),
    content: `
      <div class="form-group">
        <label class="form-label">${tl('digitalWorkers.agentName')}</label>
        <input class="input" id="af-name" value="${escHtml(a.name || '')}" placeholder="助理" />
      </div>
      <div class="form-group">
        <label class="form-label">Emoji</label>
        <input class="input" id="af-emoji" value="${escHtml(a.emoji || '🤖')}" placeholder="🤖" maxlength="4" style="width:80px" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('digitalWorkers.agentModel')}</label>
        <input class="input" id="af-model" value="${escHtml(a.model || '')}" placeholder="gpt-4o" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('digitalWorkers.agentWorkspace')}</label>
        <input class="input" id="af-workspace" value="${escHtml(a.workspace || '')}" placeholder="default" />
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-agent-save">${tl('common.save')}</button>
    `
  })

  setTimeout(() => {
    document.getElementById('btn-agent-save')?.addEventListener('click', async () => {
      const data = {
        id: isEdit ? a.id : Date.now().toString(36),
        name: document.getElementById('af-name')?.value?.trim(),
        emoji: document.getElementById('af-emoji')?.value?.trim() || '🤖',
        model: document.getElementById('af-model')?.value?.trim(),
        workspace: document.getElementById('af-workspace')?.value?.trim() || 'default'
      }
      if (!data.name) { toast(tl('digitalWorkers.agentName'), 'warn'); return }

      try {
        if (isEdit) {
          await bridge.updateAgent(data)
        } else {
          await bridge.createAgent(data)
        }
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadAgents()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

function editAgent(id) {
  const agent = _agents.find(a => a.id === id)
  if (agent) showAgentForm(agent)
}

function deleteAgent(id) {
  const agent = _agents.find(a => a.id === id)
  if (!agent) return

  showModal({
    title: tl('digitalWorkers.deleteAgent'),
    content: `<p>${tl('digitalWorkers.deleteConfirm')}</p><p style="font-weight:500;margin-top:8px">${escHtml(agent.name)}</p>`,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-danger" id="btn-agent-del-confirm">${tl('common.delete')}</button>
    `
  })
  setTimeout(() => {
    document.getElementById('btn-agent-del-confirm')?.addEventListener('click', async () => {
      try {
        await bridge.deleteAgent(id)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadAgents()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

async function openFileManager(id) {
  const agent = _agents.find(a => a.id === id)
  if (!agent) return

  let files = []
  try { files = await bridge.listWorkspaceFiles(id) || [] } catch {}

  showModal({
    title: `${tl('digitalWorkers.fileManager')} · ${escHtml(agent.name)}`,
    content: `
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:8px">${tl('digitalWorkers.workspaceFiles')}: ${files.length}</div>
      <div style="max-height:300px;overflow-y:auto">
        ${files.length
          ? files.map(f => `<div style="padding:6px 0;border-bottom:1px solid var(--border-light);font-size:var(--font-size-sm);display:flex;justify-content:space-between"><span>${escHtml(f.name || f.path || '-')}</span><span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${escHtml(f.size || '')}</span></div>`).join('')
          : `<div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>`
        }
      </div>
    `,
    footer: `<button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.close')}</button>`
  })
}

async function backupAgent(id) {
  try {
    await bridge.backupAgent(id)
    toast(tl('common.success'), 'success')
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function cleanup() { _el = null; _agents = [] }
