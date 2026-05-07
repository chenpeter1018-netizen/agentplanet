/**
 * 关于页面 — 含软件注册激活
 */
import { t } from '../lib/i18n.js'
import { isTauriRuntime } from '../lib/tauri-api.js'
import api from '../lib/tauri-api.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="config-section" style="color:var(--text-secondary);font-size:var(--font-size-sm);line-height:2">
      <p>${t('about.techStack')}</p>
      <p style="margin-top:12px;color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('about.copyright')}</p>
    </div>
    <div class="config-section" id="license-section"></div>
  `

  if (isTauriRuntime()) {
    renderLicenseCard(page)
  }

  return page
}

async function renderLicenseCard(page) {
  const el = page.querySelector('#license-section')

  // 先显示加载
  el.innerHTML = `<div class="card" style="text-align:center;padding:var(--space-xl)"><span class="skeleton" style="display:inline-block;width:200px;height:20px;border-radius:4px"></span></div>`

  let status
  try { status = await api.checkLicense() } catch { status = null }

  const activated = status?.activated
  const onlineChecked = status?.online_verified

  el.innerHTML = `
    <div class="config-section-title" style="display:flex;align-items:center;gap:8px">
      🛡️ ${t('about.licenseTitle')}
      ${activated
        ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--success-muted);color:var(--success);font-weight:600">已激活</span>`
        : `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--warning-muted);color:var(--warning);font-weight:600">未激活</span>`
      }
    </div>
    <div class="card" style="margin-top:var(--space-sm)">
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.8;margin-bottom:var(--space-md)">
        ${activated
          ? `${t('about.licenseActivated')}<br>
             ${t('about.licenseLicensee')}: <strong>${status.licensee}</strong> &nbsp;·&nbsp;
             ${t('about.licenseMachines')}: <strong>${status.machines_used}/${status.max_machines}</strong>
             ${onlineChecked ? '&nbsp;·&nbsp;✅ ' + t('about.licenseOnline') : '&nbsp;·&nbsp;⏳ ' + t('about.licenseOffline')}
             ${status.days_remaining ? '&nbsp;·&nbsp;📅 ' + t('about.licenseExpires', { days: status.days_remaining }) : ''}`
          : `${t('about.licenseDesc')}`
        }
      </p>
      ${activated
        ? `<div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${t('about.licenseFingerprint')}: ${status.fingerprint || '—'}</div>`
        : `
        <div style="display:flex;gap:var(--space-sm);align-items:center;flex-wrap:wrap">
          <input id="license-key-input" type="text" placeholder="AGPT-XXXX-XXXX-..."
            style="flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--border-primary);border-radius:var(--radius-md);font-size:var(--font-size-sm);font-family:var(--font-mono);background:var(--bg-secondary);color:var(--text-primary);outline:none">
          <button class="btn btn-primary btn-sm" id="btn-activate">🔑 ${t('about.licenseActivateBtn')}</button>
        </div>
        <div id="license-msg" style="margin-top:8px;font-size:var(--font-size-xs);min-height:18px"></div>
        <p style="margin-top:12px;font-size:var(--font-size-xs);color:var(--text-tertiary)">
          🔒 ${t('about.licenseHint')}
        </p>
        `
      }
    </div>
  `
  if (!activated) setupActivateForm(page)
}

function setupActivateForm(page) {
  const input = page.querySelector('#license-key-input')
  const btn = page.querySelector('#btn-activate')
  const msg = page.querySelector('#license-msg')
  if (!input || !btn) return

  async function doActivate() {
    const key = input.value.trim()
    if (!key || key.length < 10) { msg.style.color = 'var(--error)'; msg.textContent = t('about.licenseInvalidKey'); return }
    btn.disabled = true; btn.textContent = '⏳ ' + t('about.licenseVerifying')
    msg.textContent = ''
    try {
      const result = await api.activateLicense(key)
      if (result.activated) { msg.style.color = 'var(--success)'; msg.textContent = '✅ ' + t('about.licenseSuccess'); setTimeout(() => renderLicenseCard(page.closest('.page')), 1000) }
      else { msg.style.color = 'var(--error)'; msg.textContent = result.reason || t('about.licenseFailed') }
    } catch (e) { msg.style.color = 'var(--error)'; msg.textContent = String(e).replace(/^Error:\s*/, '') }
    btn.disabled = false; btn.textContent = '🔑 ' + t('about.licenseActivateBtn')
  }
  btn.addEventListener('click', doActivate)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doActivate() })
}
