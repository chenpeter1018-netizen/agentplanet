/**
 * ZeroClaw 知识库页面
 */
import { api } from '../../../lib/tauri-api.js'
import { t } from '../../../lib/i18n.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.knowledge')}</h1>
      <p class="page-desc">${t('engine.zcKnowledgeDesc')}</p>
    </div>
    <div class="config-section" style="text-align:center;padding:48px 24px">
      <p style="font-size:16px;color:var(--text-secondary)">
        ZeroClaw 知识库存储在本地目录，支持拖拽上传文档
      </p>
      <button class="btn btn-secondary" data-action="zc-open-knowledge" style="margin-top:16px">📁 ${t('engine.openKnowledgeDir')}</button>
    </div>
  `
  page.querySelector('[data-action="zc-open-knowledge"]')?.addEventListener('click', async () => {
    try { await api.zeroclawOpenDir('knowledge') }
    catch (e) { /* ignore */ }
  })
  return page
}
