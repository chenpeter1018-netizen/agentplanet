/**
 * ZeroClaw 备份管理页面
 */
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { t } from '../../../lib/i18n.js'

let _page = null

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page'
  _page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.backup')}</h1>
      <p class="page-desc">${t('engine.zcBackupDesc')}</p>
    </div>
    <div id="zc-backup-body">
      <div class="config-section" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-primary" data-action="zc-backup-create">${t('engine.createBackup')}</button>
      </div>
      <div id="zc-backup-list">
        <div class="stat-card loading-placeholder" style="height:80px"></div>
      </div>
    </div>
  `
  bindEvents()
  loadSnapshots()
  return _page
}

function bindEvents() {
  _page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn || btn.disabled) return
    btn.disabled = true
    const action = btn.dataset.action
    try {
      if (action === 'zc-backup-create') {
        const name = `backup_${Date.now()}`
        await api.zeroclawCreateSnapshot(name)
        toast(t('engine.backupCreated'), 'success')
      } else if (action === 'zc-backup-restore') {
        await api.zeroclawRestoreSnapshot(btn.dataset.name)
        toast(t('engine.backupRestored'), 'success')
      }
    } catch (e) { toast(e?.message || e, 'error') }
    setTimeout(() => loadSnapshots(), 800)
  })
}

async function loadSnapshots() {
  const listEl = _page?.querySelector('#zc-backup-list')
  if (!listEl) return
  try {
    const snapshots = await api.zeroclawListSnapshots()
    if (!snapshots || !snapshots.length) {
      listEl.innerHTML = `<div class="form-hint">${t('engine.noBackups')}</div>`
      return
    }
    listEl.innerHTML = snapshots.map(s => `
      <div class="stat-card" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="stat-label">${s.name || s}</div>
          <div class="form-hint" style="font-size:11px">${s.timestamp || ''}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-action="zc-backup-restore" data-name="${s.name || s}">${t('engine.restore')}</button>
      </div>
    `).join('')
  } catch (e) {
    listEl.innerHTML = `<div class="form-hint">${t('engine.loadFailed')}</div>`
  }
}
