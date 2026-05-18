/**
 * 安全设置页面 — 妙搭集成版
 * 提供修改登录密码、找回密码入口，保留无视风险模式
 */
import { toast } from '../components/toast.js'
import { statusIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { navigate } from '../router.js'

const isTauri = !!window.__TAURI_INTERNALS__
let _tauriApi = null

async function getTauriApi() {
  if (!_tauriApi) _tauriApi = (await import('../lib/tauri-api.js')).api
  return _tauriApi
}

async function readPanelConfig() {
  if (isTauri) {
    const api = await getTauriApi()
    return api.readPanelConfig()
  }
  const resp = await fetch('/__api/read_panel_config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  return resp.json()
}

async function writePanelConfig(cfg) {
  if (isTauri) {
    const api = await getTauriApi()
    return api.writePanelConfig(cfg)
  }
  const resp = await fetch('/__api/write_panel_config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: cfg }),
  })
  return resp.json()
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '—'
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header"><h1>${t('security.title')}</h1></div>
    <div id="security-content">
      <div class="config-section loading-placeholder" style="height:120px"></div>
    </div>
  `

  // 读取当前账号信息
  let phone = ''
  const stored = sessionStorage.getItem('agent_planet_login_payload')
  if (stored) {
    try { phone = JSON.parse(stored).phone || '' } catch (_) {}
  }

  loadStatus(page, phone)
  return page
}

async function loadStatus(page, phone) {
  const container = page.querySelector('#security-content')
  try {
    const cfg = await readPanelConfig()
    renderContent(container, cfg, phone)
  } catch (e) {
    container.innerHTML = `<div class="config-section"><p style="color:var(--error)">${t('security.loadFailed')}: ${e.message}</p></div>`
  }
}

function renderContent(container, cfg, phone) {
  const ignoreRisk = !!cfg.ignoreRisk
  let html = ''

  // 当前账号
  html += `
    <div class="config-section">
      <div class="config-section-title">账号信息</div>
      <div style="padding:12px 16px;background:var(--bg-tertiary);border-radius:var(--radius-sm)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:700">
            ${phone ? phone.slice(-2) : '?'}
          </div>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${maskPhone(phone)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">妙搭账号</div>
          </div>
        </div>
      </div>
    </div>
  `

  // 密码管理入口
  html += `
    <div class="config-section">
      <div class="config-section-title">密码管理</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="sec-link-btn" id="btn-change-pw">
          <div class="sec-link-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div class="sec-link-text">
            <div class="sec-link-label">修改登录密码</div>
            <div class="sec-link-desc">更改在妙搭平台的登录密码</div>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <button class="sec-link-btn" id="btn-forgot-pw">
          <div class="sec-link-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
              <path d="M12 15v2"/>
            </svg>
          </div>
          <div class="sec-link-text">
            <div class="sec-link-label">找回密码</div>
            <div class="sec-link-desc">通过短信验证码重置登录密码</div>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  `

  // 无视风险模式
  html += `
    <div class="config-section">
      <div class="config-section-title" style="display:flex;align-items:center;gap:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        ${t('security.ignoreRiskTitle')}
      </div>
      <div style="padding:12px 16px;background:${ignoreRisk ? 'rgba(239,68,68,0.08)' : 'var(--bg-tertiary)'};border-radius:var(--radius-sm);border:1px solid ${ignoreRisk ? 'rgba(239,68,68,0.2)' : 'var(--border-primary)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:500;color:var(--text-primary)">${t('security.ignoreRiskLabel')}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:4px;line-height:1.5">
              ${t('security.ignoreRiskDesc')}<br>
              <strong style="color:var(--error)">${t('security.ignoreRiskWarn')}</strong>
            </div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-ignore-risk" ${ignoreRisk ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div id="ignore-risk-confirm" style="display:none;margin-top:12px;padding:12px 16px;background:rgba(239,68,68,0.06);border-radius:var(--radius-sm);border:1px solid rgba(239,68,68,0.15)">
        <p style="font-size:var(--font-size-sm);color:var(--error);font-weight:600;margin-bottom:8px">${t('security.ignoreRiskConfirmTitle')}</p>
        <p style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:12px;line-height:1.5">
          ${t('security.ignoreRiskConfirmDesc')}
        </p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="btn-confirm-ignore" style="background:var(--error);color:#fff;border:none">${t('security.ignoreRiskConfirmBtn')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-cancel-ignore">${t('common.cancel')}</button>
        </div>
      </div>
    </div>
  `

  // CSS
  const style = document.createElement('style')
  style.textContent = `
    .sec-link-btn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; border: 1px solid var(--border-primary); border-radius: var(--radius-sm); background: var(--bg-secondary); cursor: pointer; transition: all 0.15s; text-align: left; color: var(--text-primary); }
    .sec-link-btn:hover { background: var(--bg-tertiary); border-color: var(--border-secondary); }
    .sec-link-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(99,102,241,0.12); color: #6366f1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sec-link-text { flex: 1; }
    .sec-link-label { font-weight: 600; font-size: var(--font-size-sm); color: var(--text-primary); }
    .sec-link-desc { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 2px; }
  `
  container.innerHTML = html
  container.parentElement?.querySelector('style[data-sec]')?.remove()
  style.setAttribute('data-sec', '')
  container.appendChild(style)

  // 事件绑定
  container.querySelector('#btn-change-pw').addEventListener('click', () => navigate('/change-password'))
  container.querySelector('#btn-forgot-pw').addEventListener('click', () => navigate('/forgot-password'))

  const toggle = container.querySelector('#toggle-ignore-risk')
  const confirmBox = container.querySelector('#ignore-risk-confirm')
  if (toggle && confirmBox) {
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        confirmBox.style.display = 'block'
        toggle.checked = false
      } else {
        handleIgnoreRisk(container, false)
      }
    })
    container.querySelector('#btn-confirm-ignore')?.addEventListener('click', () => handleIgnoreRisk(container, true))
    container.querySelector('#btn-cancel-ignore')?.addEventListener('click', () => { confirmBox.style.display = 'none' })
  }
}

async function handleIgnoreRisk(container, enable) {
  try {
    const cfg = await readPanelConfig()
    if (enable) {
      delete cfg.accessPassword
      delete cfg.mustChangePassword
      cfg.ignoreRisk = true
      sessionStorage.removeItem('agent_planet_authed')
    } else {
      delete cfg.ignoreRisk
    }
    await writePanelConfig(cfg)
    if (enable) {
      toast(t('security.ignoreRiskEnabled'), 'warning')
    } else {
      toast(t('security.ignoreRiskDisabled'), 'info')
    }
    setTimeout(() => loadStatus(container.closest('.page'), ''), 500)
  } catch (e) {
    toast(t('security.operationFailed') + ': ' + e.message, 'error')
  }
}
