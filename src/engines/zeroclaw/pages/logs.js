/**
 * ZeroClaw 日志查看页面
 */
import { api } from '../../../lib/tauri-api.js'
import { t } from '../../../lib/i18n.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.logs')}</h1>
      <p class="page-desc">${t('engine.zcLogsDesc')}</p>
    </div>
    <div class="config-section" style="text-align:center;padding:48px 24px">
      <p style="font-size:16px;color:var(--text-secondary)">
        ZeroClaw Gateway 运行日志
      </p>
      <button class="btn btn-secondary" data-action="zc-open-logs" style="margin-top:16px">📋 ${t('engine.openLogsDir')}</button>
    </div>
  `
  page.querySelector('[data-action="zc-open-logs"]')?.addEventListener('click', async () => {
    try { await api.zeroclawOpenDir('logs') }
    catch (e) { /* ignore */ }
  })
  return page
}
