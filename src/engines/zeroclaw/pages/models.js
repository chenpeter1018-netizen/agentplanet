/**
 * ZeroClaw 模型配置页面
 * 通过 ZeroClaw Gateway 管理模型
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showModal, showConfirm } from '../../../components/modal.js'

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

let _page = null
let _config = null
let _models = []
let _loading = true

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page zc-models-page'
  _page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.models')}</h1>
      <p class="page-desc" id="zc-models-desc">${t('engine.loading')}</p>
    </div>
    <div class="config-actions">
      <button class="btn btn-primary btn-sm" id="zc-add-model">${t('models.addModel')}</button>
      <button class="btn btn-secondary btn-sm" id="zc-refresh-models">${t('engine.dashRefresh')}</button>
    </div>
    <div id="zc-models-body">
      <div class="stat-card loading-placeholder" style="height:120px"></div>
    </div>
  `
  bindEvents()
  loadModels()
  return _page
}

function bindEvents() {
  _page.querySelector('#zc-add-model')?.addEventListener('click', openAddModel)
  _page.querySelector('#zc-refresh-models')?.addEventListener('click', loadModels)
}

async function loadModels() {
  _loading = true
  const body = _page?.querySelector('#zc-models-body')
  const desc = _page?.querySelector('#zc-models-desc')
  if (!body) return

  try {
    // Read zeroclaw config to get current model settings
    const info = await api.checkZeroclaw()
    _config = info || {}

    // Try to get models from gateway
    let gatewayModels = []
    try {
      const resp = await api.zeroclawApiProxy('GET', '/v1/models', null, null)
      if (resp?.status >= 200 && resp?.status < 300 && resp?.body) {
        if (Array.isArray(resp.body)) {
          gatewayModels = resp.body
        } else if (Array.isArray(resp.body.data)) {
          gatewayModels = resp.body.data
        } else if (Array.isArray(resp.body.models)) {
          gatewayModels = resp.body.models
        }
      }
    } catch (_) { /* gateway may not be running */ }

    _models = gatewayModels

    if (desc && info?.running) {
      desc.innerHTML = `<span style="color:var(--success)">●</span> ${t('engine.gatewayRunning')} — ${_models.length} ${t('models.title')}`
    } else if (desc) {
      desc.innerHTML = `<span style="color:var(--text-tertiary)">●</span> ${t('engine.serviceStopped')} — <a href="#/z/service">${t('engine.goToService')}</a>`
    }

    renderModelList(body)
  } catch (e) {
    if (desc) desc.textContent = t('engine.loadFailed')
    body.innerHTML = `<div class="zc-model-empty">${t('engine.loadFailed')}: ${esc(e?.message || String(e))}</div>`
  }
  _loading = false
}

function renderModelList(body) {
  if (_models.length === 0) {
    body.innerHTML = `
      <div class="zc-model-empty">
        <div style="margin-bottom:8px;font-size:15px;color:var(--text-secondary)">${t('models.noModels')}</div>
        <div style="font-size:13px;margin-bottom:16px">${t('models.noModelsHint')}</div>
        <button class="btn btn-primary btn-sm" id="zc-add-model-empty">${t('models.addModel')}</button>
      </div>
    `
    body.querySelector('#zc-add-model-empty')?.addEventListener('click', openAddModel)
    return
  }

  // Group models by provider/owner if available
  const grouped = {}
  _models.forEach(m => {
    const owner = m.owned_by || m.provider || m.owner || 'Default'
    if (!grouped[owner]) grouped[owner] = []
    grouped[owner].push(m)
  })

  body.innerHTML = Object.entries(grouped).map(([provider, models]) => `
    <div class="config-section">
      <div class="zc-models-provider-header">
        <span class="zc-models-provider-name">${esc(provider)}</span>
        <span class="zc-models-provider-type">${models.length} ${t('models.title')}</span>
      </div>
      <div class="zc-models-list">
        ${models.map(m => `
          <div class="zc-model-item">
            <div>
              <span class="zc-model-item-name">${esc(m.id || m.name || m.model)}</span>
              ${m.created ? `<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${esc(String(m.created))}</span>` : ''}
            </div>
            <div class="zc-model-item-actions">
              <button class="btn btn-secondary btn-xs zc-model-edit" data-model-id="${esc(m.id || m.name || m.model)}">${t('common.edit')}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')

  // Bind edit buttons
  body.querySelectorAll('.zc-model-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const modelId = btn.dataset.modelId
      const model = _models.find(m => (m.id || m.name || m.model) === modelId)
      if (model) openEditModel(model)
    })
  })
}

function openAddModel() {
  showModal({
    title: t('models.addModel'),
    width: 480,
    fields: [
      { name: 'modelId', label: t('models.modelId'), type: 'text', required: true, placeholder: 'gpt-4o' },
      { name: 'provider', label: t('models.provider'), type: 'text', required: true, placeholder: 'openai' },
      { name: 'apiBase', label: t('models.apiBase'), type: 'text', placeholder: 'https://api.openai.com/v1' },
      { name: 'apiKey', label: t('models.apiKey'), type: 'password', placeholder: 'sk-...' },
    ],
    onConfirm: async (values) => {
      try {
        await api.zeroclawApiProxy('POST', '/v1/models', {
          id: values.modelId,
          provider: values.provider,
          api_base: values.apiBase || undefined,
          api_key: values.apiKey || undefined,
        })
        toast(t('models.modelAdded'), 'success')
        await loadModels()
      } catch (e) {
        toast(`${t('models.addFailed')}: ${esc(e?.message || String(e))}`, 'error')
      }
    },
  })
}

function openEditModel(model) {
  const modelId = model.id || model.name || model.model
  showModal({
    title: `${t('common.edit')} ${modelId}`,
    width: 480,
    fields: [
      { name: 'modelId', label: t('models.modelId'), type: 'text', value: modelId, required: true },
      { name: 'provider', label: t('models.provider'), type: 'text', value: model.owned_by || model.provider || '', required: true },
    ],
    onConfirm: async (values) => {
      try {
        // Update via gateway
        await api.zeroclawApiProxy('PUT', `/v1/models/${encodeURIComponent(modelId)}`, {
          id: values.modelId !== modelId ? values.modelId : undefined,
          provider: values.provider,
        })
        toast(t('models.modelUpdated'), 'success')
        await loadModels()
      } catch (e) {
        toast(`${t('models.updateFailed')}: ${esc(e?.message || String(e))}`, 'error')
      }
    },
  })
}
