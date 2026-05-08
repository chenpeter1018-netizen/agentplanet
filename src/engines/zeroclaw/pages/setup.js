/**
 * ZeroClaw 安装/设置页面
 */
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { t } from '../../../lib/i18n.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.setup')}</h1>
      <p class="page-desc">${t('engine.zcSetupDesc')}</p>
    </div>
    <div class="config-section" style="max-width:480px">
      <div class="stat-card" style="text-align:center;padding:24px">
        <p style="margin-bottom:16px">${t('engine.zcSetupHint')}</p>
        <button class="btn btn-primary" id="btn-zc-install" style="min-width:160px">${t('engine.installNow')}</button>
        <p class="form-hint" style="margin-top:12px">${t('engine.zcInstallNote')}</p>
      </div>
    </div>
  `
  page.querySelector('#btn-zc-install')?.addEventListener('click', async () => {
    const btn = page.querySelector('#btn-zc-install')
    btn.disabled = true
    btn.textContent = t('engine.installing')
    try {
      await api.installZeroclaw()
      toast(t('engine.installDone'), 'success')
    } catch (e) { toast(e?.message || e, 'error') }
    btn.disabled = false
    btn.textContent = t('engine.installNow')
  })
  return page
}
