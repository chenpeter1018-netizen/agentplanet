/**
 * Hermes 模型配置页面
 * 通过 Hermes Gateway 管理模型
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showModal } from '../../../components/modal.js'

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

let _page = null
let _models = []

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page zc-models-page'
  _page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Hermes ${t('sidebar.models')}</h1>
      <p class="page-desc" id="hm-models-desc">${t('engine.loading')}</p>
    </div>
    <div class="config-actions">
      <button class="btn btn-primary btn-sm" id="hm-add-model">${t('models.addModel')}</button>
      <button class="btn btn-secondary btn-sm" id="hm-import-openclaw">${t('models.importFromOpenClaw')}</button>
      <button class="btn btn-secondary btn-sm" id="hm-refresh-models">${t('engine.dashRefresh')}</button>
    </div>
    <div id="hm-models-body">
      <div class="stat-card loading-placeholder" style="height:120px"></div>
    </div>
  `
  bindEvents()
  loadModels()
  return _page
}

function bindEvents() {
  _page.querySelector('#hm-add-model')?.addEventListener('click', openAddModel)
  _page.querySelector('#hm-import-openclaw')?.addEventListener('click', importFromOpenclaw)
  _page.querySelector('#hm-refresh-models')?.addEventListener('click', loadModels)
}

async function loadModels() {
  const body = _page?.querySelector('#hm-models-body')
  const desc = _page?.querySelector('#hm-models-desc')
  if (!body) return

  try {
    let gatewayModels = []
    try {
      const resp = await api.hermesApiProxy('GET', '/v1/models', null, null)
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

    if (desc) {
      desc.innerHTML = `${_models.length} ${t('models.title')}`
    }

    renderModelList(body)
  } catch (e) {
    if (desc) desc.textContent = t('engine.loadFailed')
    body.innerHTML = `<div class="zc-model-empty">${t('engine.loadFailed')}: ${esc(e?.message || String(e))}</div>`
  }
}

function renderModelList(body) {
  if (_models.length === 0) {
    body.innerHTML = `
      <div class="zc-model-empty">
        <div style="margin-bottom:8px;font-size:15px;color:var(--text-secondary)">${t('models.noModels')}</div>
        <div style="font-size:13px;margin-bottom:16px">${t('models.noModelsHint')}</div>
        <button class="btn btn-primary btn-sm" id="hm-add-model-empty">${t('models.addModel')}</button>
      </div>
    `
    body.querySelector('#hm-add-model-empty')?.addEventListener('click', openAddModel)
    return
  }

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
              <button class="btn btn-secondary btn-xs hm-model-edit" data-model-id="${esc(m.id || m.name || m.model)}">${t('common.edit')}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')

  body.querySelectorAll('.hm-model-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const modelId = btn.dataset.modelId
      const model = _models.find(m => (m.id || m.name || m.model) === modelId)
      if (model) openEditModel(model)
    })
  })
}

async function importFromOpenclaw() {
  try {
    const result = await api.getOpenclawGatewayModels()
    const models = result?.models || []
    if (models.length === 0) {
      toast(t('models.noModelsToImport'), 'warning')
      return
    }
    let imported = 0
    for (const m of models) {
      const modelId = m.id || m.name || m.model
      if (!modelId) continue
      const cfg = m.config || {}
      try {
        await api.hermesApiProxy('POST', '/v1/models', {
          id: modelId,
          name: m.name || modelId,
          provider: m.provider || m.owned_by || '',
          api_base: m.api_base || m.base_url || undefined,
          api_key: m.api_key || undefined,
          stream: cfg.stream !== undefined ? cfg.stream : true,
          fast: cfg.fast !== undefined ? cfg.fast : false,
          think: cfg.think || 'low',
          temperature: cfg.temperature || undefined,
          max_tokens: cfg.maxTokens || undefined,
        })
        imported++
      } catch (e) {
        console.warn(`[hermes] import model ${modelId} failed:`, e)
      }
    }
    toast(t('models.importedCount', { count: imported }), 'success')
    await loadModels()
  } catch (e) {
    toast(`${t('models.importFailed')}: ${esc(e?.message || String(e))}`, 'error')
  }
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
        await api.hermesApiProxy('POST', '/v1/models', {
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
        await api.hermesApiProxy('PUT', `/v1/models/${encodeURIComponent(modelId)}`, {
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
