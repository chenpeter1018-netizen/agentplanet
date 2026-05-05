/**
 * Agent Planet 模型配置页面
 * 模型列表 + 预设选择 + API Key 配置 + 连接测试
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { listPresets, getPreset } from '../lib/model-presets.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

let _el = null
let _models = []
let _testing = false

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('modelConfig.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="model-presets">${tl('modelConfig.modelPresets')}</button>
        <button class="btn btn-primary" data-action="model-add">${tl('modelConfig.addModel')}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('modelConfig.modelName')}</th>
                <th>${tl('modelConfig.modelId')}</th>
                <th>${tl('modelConfig.baseUrl')}</th>
                <th>${tl('modelConfig.apiType')}</th>
                <th style="text-align:right">${tl('services.actions')}</th>
              </tr>
            </thead>
            <tbody id="model-table-body">
              <tr><td colspan="5"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  bindEvents(_el)
  loadModels()
  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action

    if (action === 'model-add') showModelForm()
    else if (action === 'model-edit') editModel(btn.dataset.id)
    else if (action === 'model-delete') deleteModel(btn.dataset.id)
    else if (action === 'model-test') testModel(btn.dataset.id)
    else if (action === 'model-presets') showPresetPicker()
  })
}

async function loadModels() {
  try {
    _models = await bridge.readModelConfig() || []
  } catch {
    _models = []
  }
  renderTable()
}

function renderTable() {
  const tbody = _el.querySelector('#model-table-body')
  if (!tbody) return

  if (!_models.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div></td></tr>`
    return
  }

  tbody.innerHTML = _models.map((m, i) => `
    <tr>
      <td style="font-weight:500">${escHtml(m.name || m.id || '-')}</td>
      <td><code style="font-size:var(--font-size-xs)">${escHtml(m.id || '-')}</code></td>
      <td style="font-size:var(--font-size-xs);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.baseUrl || '-')}</td>
      <td><span class="badge badge-info">${escHtml(m.apiType || 'openai')}</span></td>
      <td style="text-align:right">
        <button class="btn btn-sm btn-secondary" data-action="model-test" data-id="${i}" style="margin-right:4px">${tl('modelConfig.testModel')}</button>
        <button class="btn btn-sm btn-ghost" data-action="model-edit" data-id="${i}">${tl('common.edit')}</button>
        <button class="btn btn-sm btn-ghost" data-action="model-delete" data-id="${i}" style="color:var(--error)">${tl('common.delete')}</button>
      </td>
    </tr>
  `).join('')
}

function showModelForm(model, index) {
  const isEdit = model != null
  const m = model || { id: '', name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', apiType: 'openai' }

  showModal({
    title: isEdit ? tl('common.edit') : tl('modelConfig.addModel'),
    content: `
      <div class="form-group">
        <label class="form-label">${tl('modelConfig.modelName')}</label>
        <input class="input" id="mf-name" value="${escHtml(m.name || '')}" placeholder="GPT-4o" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('modelConfig.modelId')}</label>
        <input class="input" id="mf-id" value="${escHtml(m.id || '')}" placeholder="gpt-4o" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('modelConfig.baseUrl')}</label>
        <input class="input" id="mf-url" value="${escHtml(m.baseUrl || '')}" placeholder="https://api.openai.com/v1" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('modelConfig.apiKey')}</label>
        <input class="input" type="password" id="mf-key" value="${escHtml(m.apiKey || '')}" placeholder="sk-..." />
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-model-save">${tl('common.save')}</button>
    `
  })

  setTimeout(() => {
    document.getElementById('btn-model-save')?.addEventListener('click', async () => {
      const model = {
        name: document.getElementById('mf-name')?.value?.trim(),
        id: document.getElementById('mf-id')?.value?.trim(),
        baseUrl: document.getElementById('mf-url')?.value?.trim(),
        apiKey: document.getElementById('mf-key')?.value?.trim(),
        apiType: 'openai'
      }
      if (!model.id) { toast(tl('modelConfig.modelId'), 'warn'); return }

      const newModels = [..._models]
      if (index != null && index >= 0) {
        newModels[index] = { ...newModels[index], ...model }
      } else {
        newModels.push(model)
      }

      try {
        await bridge.saveModelConfig(newModels)
        _models = newModels
        renderTable()
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

function editModel(index) {
  const m = _models[parseInt(index)]
  if (m) showModelForm(m, parseInt(index))
}

function deleteModel(index) {
  const i = parseInt(index)
  const m = _models[i]
  if (!m) return

  showModal({
    title: tl('common.delete'),
    content: `<p>${tl('common.confirm')} ${escHtml(m.name || m.id)}？</p>`,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-danger" id="btn-model-del-confirm">${tl('common.delete')}</button>
    `
  })
  setTimeout(() => {
    document.getElementById('btn-model-del-confirm')?.addEventListener('click', async () => {
      try {
        const newModels = _models.filter((_, idx) => idx !== i)
        await bridge.saveModelConfig(newModels)
        _models = newModels
        renderTable()
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

async function testModel(index) {
  if (_testing) return
  const m = _models[parseInt(index)]
  if (!m) return
  _testing = true

  const btn = _el.querySelector(`[data-action="model-test"][data-id="${index}"]`)
  if (btn) { btn.disabled = true; btn.textContent = tl('modelConfig.testing') }

  try {
    const result = await bridge.testModelConnection(m)
    toast(result?.ok ? tl('modelConfig.testPass') : tl('modelConfig.testFail'), result?.ok ? 'success' : 'error')
  } catch {
    toast(tl('modelConfig.testFail'), 'error')
  }

  _testing = false
  if (btn) { btn.disabled = false; btn.textContent = tl('modelConfig.testModel') }
}

function showPresetPicker() {
  const presets = listPresets()

  showModal({
    title: tl('modelConfig.modelPresets'),
    content: `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${presets.map(p => `
          <div class="card" style="padding:12px 14px;cursor:pointer" data-preset-id="${p.id}" data-action="preset-select">
            <div style="font-weight:600;font-size:var(--font-size-sm)">${escHtml(p.name)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${escHtml(p.baseUrl || '')} · ${(p.models || []).length} ${tl('modelConfig.modelPresets')}</div>
          </div>
        `).join('')}
      </div>
    `,
    footer: `<button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.close')}</button>`
  })

  setTimeout(() => {
    document.querySelectorAll('[data-action="preset-select"]').forEach(el => {
      el.addEventListener('click', () => {
        const preset = getPreset(el.dataset.presetId)
        if (preset) {
          const model = preset.models?.[0] || {}
          showModelForm({
            name: model.name || preset.name,
            id: model.id || '',
            baseUrl: preset.baseUrl || '',
            apiKey: '',
            apiType: 'openai'
          })
          document.querySelector('.modal-overlay')?.remove()
        }
      })
    })
  }, 50)
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function cleanup() { _el = null; _models = []; _testing = false }
