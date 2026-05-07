/**
 * 系统设置页面
 * 统一管理界面语言、开机自启等配置
 */
import { t, getLang, setLang, getAvailableLangs } from '../lib/i18n.js'
import { toast } from '../components/toast.js'
import { renderSidebar } from '../components/sidebar.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('settings.title')}</h1>
      <p class="page-desc">${t('settings.desc')}</p>
    </div>

    <div class="config-section" id="language-section">
      <div class="config-section-title">${t('settings.language')}</div>
      <div id="language-bar"></div>
    </div>

    ${window.__TAURI_INTERNALS__ ? `<div class="config-section" id="autostart-section">
      <div class="config-section-title">${t('settings.autostart')}</div>
      <div id="autostart-bar"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
    </div>` : ''}

  `

  loadPage(page)
  return page
}

async function loadPage(page) {
  if (window.__TAURI_INTERNALS__) await loadAutostart(page)
  loadLanguageSwitcher(page)
}

// ===== 语言切换 =====

function loadLanguageSwitcher(page) {
  const bar = page.querySelector('#language-bar')
  if (!bar) return
  const langs = getAvailableLangs()
  const current = getLang()
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
      <select class="form-input" id="lang-select" style="max-width:200px">
        ${langs.map(l => `<option value="${l.code}" ${l.code === current ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-hint" style="margin-top:var(--space-xs)">${t('settings.languageHint')}</div>
  `
  const select = bar.querySelector('#lang-select')
  select.onchange = () => {
    setLang(select.value)
    const sidebarEl = document.getElementById('sidebar')
    if (sidebarEl) renderSidebar(sidebarEl)
    const pageEl = page.closest('.page') || page
    render().then(newPage => {
      pageEl.replaceWith(newPage)
    }).catch(() => {})
  }
}

// ===== 开机自启 =====

async function loadAutostart(page) {
  const bar = page.querySelector('#autostart-bar')
  if (!bar) return
  try {
    const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart')
    const enabled = await isEnabled()
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-sm)">
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm);cursor:pointer">
          <input type="checkbox" id="autostart-toggle" ${enabled ? 'checked' : ''}>
          ${t('settings.autostartToggle')}
        </label>
      </div>
      <div class="form-hint" style="margin-top:var(--space-xs)">
        ${t('settings.autostartHint')}
      </div>
    `
    bar.querySelector('#autostart-toggle')?.addEventListener('change', async (e) => {
      try {
        if (e.target.checked) {
          await enable()
          toast(t('settings.autostartEnabled'), 'success')
        } else {
          await disable()
          toast(t('settings.autostartDisabled'), 'success')
        }
      } catch (err) {
        e.target.checked = !e.target.checked
        toast(t('settings.autostartFailed') + ': ' + err, 'error')
      }
    })
  } catch {
    bar.innerHTML = `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm)">${t('settings.autostartUnavailable')}</div>`
  }
}
