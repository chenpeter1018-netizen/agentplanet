/**
 * ZeroClaw 模型配置页面
 * 通过 ZeroClaw Gateway (v0.7.5+) JSON Patch API 管理模型
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showModal, showConfirm } from '../../../components/modal.js'

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

/// 根据 base_url 猜测服务商类型
function guessProvider(m) {
  const url = (m.api_base || '').toLowerCase()
  if (url.includes('openai.com') || url.includes('api.openai')) return 'OpenAI'
  if (url.includes('anthropic.com')) return 'Anthropic'
  if (url.includes('deepseek.com')) return 'DeepSeek'
  if (url.includes('ollama') || url.includes('11434')) return 'Ollama'
  if (url.includes('openrouter')) return 'OpenRouter'
  if (url.includes('groq.com')) return 'Groq'
  if (url.includes('googleapis.com') || url.includes('generativelanguage')) return 'Google Gemini'
  if (url.includes('mistral.ai')) return 'Mistral'
  if (url.includes('x.ai') || url.includes('x.ai')) return 'xAI'
  if (url.includes('siliconflow')) return '硅基流动'
  if (url.includes('aliyuncs.com') || url.includes('dashscope')) return '阿里云百炼'
  if (url.includes('bigmodel.cn') || url.includes('zhipu')) return '智谱AI'
  if (url.includes('moonshot') || url.includes('kimi')) return 'Moonshot'
  if (url.includes('minimax')) return 'MiniMax'
  if (url.includes('volces.com') || url.includes('volcengine')) return '火山引擎'
  return m.name || ''
}

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
      <button class="btn btn-secondary btn-sm" id="zc-import-openclaw">${t('models.importFromOpenClaw')}</button>
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
  _page.querySelector('#zc-import-openclaw')?.addEventListener('click', importFromOpenclaw)
  _page.querySelector('#zc-refresh-models')?.addEventListener('click', loadModels)
}

/// 从 config.list 条目中提取模型列表 (providers.models.<name> 的顶层条目)
/// v0.7.5 ModelProviderConfig 字段: model, base-url, api-key, name, temperature, max-tokens 等
/// 注: v0.7.5 没有 provider 字段，provider 类型由 base-url 自动推断
function parseModelsFromConfigList(entries) {
  const modelMap = {}
  const prefix = 'providers.models.'
  for (const entry of entries) {
    const path = entry.path || ''
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const dotIdx = rest.indexOf('.')
    if (dotIdx === -1) {
      const name = rest
      if (!modelMap[name]) modelMap[name] = { id: name, name: '', model: '', api_base: '', api_key: '', has_values: false }
    }
  }
  for (const entry of entries) {
    const path = entry.path || ''
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    const dotIdx = rest.indexOf('.')
    if (dotIdx === -1) continue
    const name = rest.slice(0, dotIdx)
    if (!modelMap[name]) continue
    const prop = rest.slice(dotIdx + 1)
    const raw = entry.value
    if (raw === '<unset>' || raw === undefined || raw === null) continue
    const val = String(raw)
    modelMap[name].has_values = true
    switch (prop) {
      case 'name': modelMap[name].name = val; break
      case 'model': modelMap[name].model = val; break
      case 'base-url': modelMap[name].api_base = val; break
      case 'api-key': modelMap[name].api_key = entry.is_secret ? '••••••' : val; break
    }
  }
  // 过滤掉没有任何属性被填充的空模型
  return Object.values(modelMap).filter(m => m.has_values || m.model)
}

async function loadModels() {
  _loading = true
  const body = _page?.querySelector('#zc-models-body')
  const desc = _page?.querySelector('#zc-models-desc')
  if (!body) return

  try {
    const info = await api.checkZeroclaw()
    _config = info || {}

    let gatewayModels = []
    try {
      const resp = await api.zeroclawApiProxy('GET', '/api/config/list', null, null)
      if (resp?.status >= 200 && resp?.status < 300 && resp?.body?.entries) {
        gatewayModels = parseModelsFromConfigList(resp.body.entries)
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

  const grouped = {}
  _models.forEach(m => {
    const owner = guessProvider(m) || 'Default'
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
              <span class="zc-model-item-name">${esc(m.model || m.id)}</span>
              ${m.id ? `<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${esc(m.id)}</span>` : ''}
            </div>
            <div class="zc-model-item-actions">
              <button class="btn btn-secondary btn-xs zc-model-edit" data-model-id="${esc(m.id)}">${t('common.edit')}</button>
              <button class="btn btn-danger btn-xs zc-model-delete" data-model-id="${esc(m.id)}">${t('common.delete')}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')

  body.querySelectorAll('.zc-model-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const modelId = btn.dataset.modelId
      const model = _models.find(m => m.id === modelId)
      if (model) openEditModel(model)
    })
  })
  body.querySelectorAll('.zc-model-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const modelId = btn.dataset.modelId
      const model = _models.find(m => m.id === modelId)
      const name = model?.model || modelId
      const confirmed = await showConfirm({ title: t('models.confirmDeleteModel', { name }), message: '' })
      if (!confirmed) return
      try {
        // v0.7.5 不支持删除 map key，清除所有属性使其不可见
        const propsToRemove = ['model', 'base-url', 'api-key', 'name']
        const patches = propsToRemove.map(prop => ({ op: 'remove', path: `providers.models.${modelId}.${prop}` }))
        await api.zeroclawApiProxy('PATCH', '/api/config', patches)
        toast(t('models.modelDeleted', { name }), 'success')
        await loadModels()
      } catch (e) {
        toast(`${t('models.deleteFailed')}: ${esc(e?.message || String(e))}`, 'error')
      }
    })
  })
}

function openAddModel() {
  showModal({
    title: t('models.addModel'),
    width: 480,
    fields: [
      { name: 'modelId', label: t('models.modelId'), type: 'text', required: true, placeholder: 'my-model' },
      { name: 'model', label: t('models.modelId'), type: 'text', required: true, placeholder: 'gpt-4o' },
      { name: 'apiBase', label: t('models.baseUrl'), type: 'text', placeholder: 'https://api.openai.com/v1' },
      { name: 'apiKey', label: t('models.apiKey'), type: 'password', placeholder: 'sk-...' },
    ],
    onConfirm: async (values) => {
      try {
        // Step 1: 创建 map-key 条目
        const mapKeyPath = `/api/config/map-key?path=providers.models&key=${encodeURIComponent(values.modelId)}`
        await api.zeroclawApiProxy('POST', mapKeyPath, null, null)
        // Step 2: PATCH 设置属性
        const patches = [
          { op: 'replace', path: `providers.models.${values.modelId}.model`, value: values.model },
        ]
        if (values.apiBase) patches.push({ op: 'replace', path: `providers.models.${values.modelId}.base-url`, value: values.apiBase })
        if (values.apiKey) patches.push({ op: 'replace', path: `providers.models.${values.modelId}.api-key`, value: values.apiKey })
        await api.zeroclawApiProxy('PATCH', '/api/config', patches)
        toast(t('models.modelAdded', { name: values.model }), 'success')
        await loadModels()
      } catch (e) {
        toast(`${t('models.addFailed')}: ${esc(e?.message || String(e))}`, 'error')
      }
    },
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
      const safeKey = modelId.replace(/[^a-zA-Z0-9_.-]/g, '-')
      try {
        // Step 1: 创建 map-key
        const mapKeyPath = `/api/config/map-key?path=providers.models&key=${encodeURIComponent(safeKey)}`
        await api.zeroclawApiProxy('POST', mapKeyPath, null, null)
        // Step 2: PATCH 设置属性
        const patches = [
          { op: 'replace', path: `providers.models.${safeKey}.model`, value: modelId },
        ]
        if (m.api_base || m.base_url) patches.push({ op: 'replace', path: `providers.models.${safeKey}.base-url`, value: m.api_base || m.base_url })
        if (m.api_key) patches.push({ op: 'replace', path: `providers.models.${safeKey}.api-key`, value: m.api_key })
        await api.zeroclawApiProxy('PATCH', '/api/config', patches)
        imported++
      } catch (e) {
        console.warn(`[zeroclaw] import model ${safeKey} failed:`, e)
      }
    }
    if (imported > 0) {
      toast(t('models.importedCount', { count: imported }), 'success')
    } else {
      toast(t('models.importFailed'), 'error')
    }
    await loadModels()
  } catch (e) {
    toast(`${t('models.importFailed')}: ${esc(e?.message || String(e))}`, 'error')
  }
}

function openEditModel(model) {
  const modelId = model.id
  showModal({
    title: `${t('common.edit')} ${modelId}`,
    width: 480,
    fields: [
      { name: 'model', label: t('models.modelId'), type: 'text', value: model.model, required: true },
      { name: 'name', label: t('models.displayName'), type: 'text', value: model.name || '' },
      { name: 'apiBase', label: t('models.baseUrl'), type: 'text', value: model.api_base || '' },
    ],
    onConfirm: async (values) => {
      try {
        const patches = [
          { op: 'replace', path: `providers.models.${modelId}.model`, value: values.model },
        ]
        if (values.name) {
          patches.push({ op: 'replace', path: `providers.models.${modelId}.name`, value: values.name })
        }
        if (values.apiBase) {
          patches.push({ op: 'replace', path: `providers.models.${modelId}.base-url`, value: values.apiBase })
        }
        await api.zeroclawApiProxy('PATCH', '/api/config', patches)
        toast(t('models.modelUpdated'), 'success')
        await loadModels()
      } catch (e) {
        toast(`${t('models.updateFailed')}: ${esc(e?.message || String(e))}`, 'error')
      }
    },
  })
}
