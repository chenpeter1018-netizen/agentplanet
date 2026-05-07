/**
 * 引擎管理页面
 * 三分区折叠：运行控制 / 环境配置 / 配置管理
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showConfirm, showModal, showUpgradeModal, showContentModal } from '../components/modal.js'
import { isMacPlatform, isInDocker, setUpgrading, setUserStopped, resetAutoRestart } from '../lib/app-state.js'
import { isForeignGatewayError, isForeignGatewayService, maybeShowForeignGatewayBindingPrompt, showGatewayConflictGuidance } from '../lib/gateway-ownership.js'
import { diagnoseInstallError } from '../lib/error-diagnosis.js'
import { icon, statusIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { getActiveEngineId } from '../lib/engine-manager.js'

const isTauri = !!window.__TAURI_INTERNALS__

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ===== 环境配置辅助函数 =====

function platformDefaultDockerEndpoint() {
  const isWin = navigator.platform?.startsWith('Win') || navigator.userAgent?.includes('Windows')
  return isWin ? '//./pipe/docker_engine' : '/var/run/docker.sock'
}

function effectiveDockerEndpoint(cfg) {
  return (cfg?.dockerEndpoint || '').trim() || platformDefaultDockerEndpoint()
}

function effectiveDockerImage(cfg) {
  return (cfg?.dockerDefaultImage || '').trim() || 'ghcr.io/Agent Planet Systems/openclaw'
}

const REGISTRIES = [
  { label: () => t('settings.registryTaobao'), value: 'https://registry.npmmirror.com' },
  { label: () => t('settings.registryNpm'), value: 'https://registry.npmjs.org' },
  { label: () => t('settings.registryHuawei'), value: 'https://repo.huaweicloud.com/repository/npm/' },
]

function openclawInstallationIdentity(inst) {
  const rawPath = String(inst?.path || '').trim()
  if (!rawPath) return ''
  const isWin = navigator.platform?.startsWith('Win') || navigator.userAgent?.includes('Windows')
  if (!isWin) return rawPath
  return rawPath.replace(/\//g, '\\').replace(/\\openclaw(?:\.exe|\.ps1)?$/i, '\\openclaw.cmd').toLowerCase()
}

function dedupeOpenclawInstallations(list = []) {
  const map = new Map()
  const preferCmd = inst => /openclaw\.cmd$/i.test(String(inst?.path || ''))
  for (const inst of (Array.isArray(list) ? list : [])) {
    const key = openclawInstallationIdentity(inst)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || (!existing.active && inst.active) || (!preferCmd(existing) && preferCmd(inst))) {
      map.set(key, inst)
    }
  }
  return [...map.values()]
}

function parseOpenclawSearchPaths(raw) {
  const values = []
  const seen = new Set()
  for (const part of String(raw || '').split(/[\r\n;]+/)) {
    const value = part.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    values.push(value)
  }
  return values
}

// ===== 渲染入口 =====

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  const isHermes = getActiveEngineId() === 'hermes'
  const chevron = '<svg class="collapsible-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('services.title')}</h1>
      <p class="page-desc">${t('services.desc')}</p>
    </div>

    <!-- 分区 1: 运行控制 -->
    <div class="collapsible-section collapsed">
      <div class="collapsible-header">
        <span class="collapsible-header-title">${chevron} ${t('services.sectionRuntimeControl')}</span>
      </div>
      <div class="collapsible-body">
        <div id="version-cards" style="margin-bottom:var(--space-lg)">
          <div class="stat-cards">
            <div class="stat-card loading-placeholder"></div>
            <div class="stat-card loading-placeholder"></div>
            <div class="stat-card loading-placeholder"></div>
          </div>
        </div>
        <div id="services-list"><div class="stat-card loading-placeholder" style="height:64px"></div></div>
        <div class="config-section" id="docker-manager-section" style="margin-top:var(--space-lg)">
          <div class="config-section-title">${t('services.dockerManager')}</div>
          <div class="form-hint" style="margin-bottom:var(--space-sm)">${t('services.dockerManagerHint')}</div>
          <div id="docker-manager-bar"><div class="stat-card loading-placeholder" style="height:96px"></div></div>
        </div>
      </div>
    </div>

    <!-- 分区 2: 环境配置 -->
    ${isHermes ? '' : `<div class="collapsible-section">
      <div class="collapsible-header">
        <span class="collapsible-header-title">${chevron} ${t('services.sectionEnvConfig')}</span>
      </div>
      <div class="collapsible-body">
        <div class="config-section" id="registry-section">
          <div class="config-section-title">${t('settings.npmRegistry')}</div>
          <div id="registry-bar"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
        </div>
        <div class="config-section" id="openclaw-dir-section">
          <div class="config-section-title">${t('settings.openclawDir')}</div>
          <div id="openclaw-dir-bar"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
        </div>
        <div class="config-section" id="openclaw-search-section">
          <div class="config-section-title">${t('settings.openclawSearchPaths')}</div>
          <div id="openclaw-search-bar"><div class="stat-card loading-placeholder" style="height:96px"></div></div>
        </div>
        <div class="config-section" id="cli-binding-section">
          <div class="config-section-title">${t('settings.openclawCli')}</div>
          <div id="cli-binding-bar"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
        </div>
        <div class="config-section" id="docker-defaults-section">
          <div class="config-section-title">${t('settings.dockerDefaults')}</div>
          <div id="docker-defaults-bar"><div class="stat-card loading-placeholder" style="height:84px"></div></div>
        </div>
        <div class="config-section" id="git-path-section">
          <div class="config-section-title">${t('settings.gitPath')}</div>
          <div id="git-path-bar"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
        </div>
      </div>
    </div>`}

    <!-- 分区 3: 配置管理 -->
    <div class="collapsible-section collapsed">
      <div class="collapsible-header">
        <span class="collapsible-header-title">${chevron} ${t('services.sectionConfigMgmt')}</span>
      </div>
      <div class="collapsible-body">
        <div class="config-section" id="config-editor-section" style="display:none">
          <div class="config-section-title">${t('services.configEditor')}</div>
          <div class="form-hint" style="margin-bottom:var(--space-sm)">${t('services.configEditorHint')}</div>
          <div style="display:flex;gap:8px;margin-bottom:var(--space-sm)">
            <button class="btn btn-primary btn-sm" data-action="save-config" disabled>${t('services.saveAndRestart')}</button>
            <button class="btn btn-secondary btn-sm" data-action="save-config-only" disabled>${t('services.saveOnly')}</button>
            <button class="btn btn-secondary btn-sm" data-action="reload-config">${t('services.reloadConfig')}</button>
          </div>
          <div id="config-editor-status" style="font-size:var(--font-size-xs);margin-bottom:6px;min-height:18px"></div>
          <textarea id="config-editor-area" class="form-input" style="font-family:var(--font-mono);font-size:12px;min-height:320px;resize:vertical;tab-size:2;white-space:pre;overflow-x:auto" spellcheck="false" disabled></textarea>
        </div>
        <div class="config-section" id="config-calibration-section">
          <div class="config-section-title">${t('services.configCalibration')}</div>
          <div class="form-hint" style="margin-bottom:var(--space-sm)">${t('services.configCalibrationHint')}</div>
          <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-sm)">
            <button class="btn btn-primary btn-sm" data-action="calibrate-config-inherit">${t('services.calibrateInherit')}</button>
            <button class="btn btn-secondary btn-sm" data-action="calibrate-config-reset">${t('services.calibrateReset')}</button>
          </div>
          <div style="display:grid;gap:8px;margin-bottom:var(--space-sm)">
            <div class="setup-inline-note">${t('services.calibrateInheritHint')}</div>
            <div class="setup-inline-note">${t('services.calibrateResetHint')}</div>
          </div>
          <div id="config-calibration-status" style="font-size:var(--font-size-xs);min-height:18px;color:var(--text-tertiary)"></div>
        </div>
        <div class="config-section" id="backup-section">
          <div class="config-section-title">${t('services.configBackup')}</div>
          <div class="form-hint" style="margin-bottom:var(--space-sm)">${t('services.configBackupHint')}</div>
          <div id="backup-actions" style="margin-bottom:var(--space-md)">
            <button class="btn btn-primary btn-sm" data-action="create-backup">${t('services.createBackup')}</button>
          </div>
          <div id="backup-list"><div class="stat-card loading-placeholder" style="height:48px"></div></div>
        </div>
      </div>
    </div>
  `

  bindCollapsibleSections(page)
  bindEvents(page)
  loadAll(page)
  return page
}

function bindCollapsibleSections(page) {
  page.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.collapsible-section').classList.toggle('collapsed')
    })
  })
}

async function loadAll(page) {
  const isHermes = getActiveEngineId() === 'hermes'
  const tasks = [
    loadVersionCards(page),
    loadServices(page),
    loadDockerManager(page),
    loadBackups(page),
    loadConfigEditor(page),
  ]
  if (!isHermes) {
    tasks.push(
      loadRegistry(page),
      loadOpenclawDir(page),
      loadOpenclawSearchPaths(page),
      loadDockerDefaults(page),
      loadCliBinding(page),
      loadGitPath(page),
    )
  }
  await Promise.all(tasks)
}

// ===== 版本信息卡片（从 about.js 迁移） =====

let lastVersionInfo = null
let detectedSource = 'chinese'

async function loadVersionCards(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [version, install] = await Promise.all([
      api.getVersionInfo(),
      api.checkInstallation(),
    ])
    lastVersionInfo = version
    detectedSource = version.source || 'chinese'

    const isInstalled = !!version.current
    const sourceLabel = version.source === 'official' ? t('about.official') : version.source === 'chinese' ? t('about.chinese') : t('about.unknownSource')
    const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'
    cards.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-card-header"><span class="stat-card-label">OpenClaw · ${sourceLabel}</span></div>
          <div class="stat-card-value">${version.current || t('about.notInstalled')}</div>
          <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${version.latest_update_available && version.latest ? `<span style="color:var(--text-tertiary)">${t('about.latestUpstream', { ver: version.latest })}</span>` : ''}
            <button class="btn btn-${isInstalled ? 'secondary' : 'primary'} btn-sm" id="btn-version-mgmt" style="${btnSm}">
              ${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}
            </button>
            ${isInstalled ? `<button class="btn btn-secondary btn-sm" id="btn-uninstall" style="${btnSm};color:var(--error)">${t('about.uninstall')}</button>` : ''}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-header"><span class="stat-card-label">${t('about.installPath')}</span></div>
          <div class="stat-card-value" style="font-size:var(--font-size-sm);word-break:break-all">${install.path || t('common.unknown')}</div>
          <div class="stat-card-meta">${install.installed ? t('about.configExists') : t('about.configNotFound')}</div>
        </div>
      </div>
    `

    cards.querySelector('#btn-version-mgmt')?.addEventListener('click', () => showVersionPicker(page, version))

    cards.querySelector('#btn-uninstall')?.addEventListener('click', async () => {
      const confirmed = await showConfirm(t('about.confirmUninstall'))
      if (!confirmed) return
      const modal = showUpgradeModal(t('about.uninstallTitle'))
      modal.setProgressLabels({
        preparing: t('about.uninstallStopping'),
        downloading: t('about.uninstallRemoving'),
        installing: t('about.uninstallCleaning'),
        done: t('about.uninstallDone'),
      })
      modal.onClose(() => loadVersionCards(page))
      modal.appendLog(t('about.uninstallStarting'))
      let unlistenLog, unlistenProgress, unlistenDone, unlistenError
      const cleanup = () => { unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
      try {
        if (window.__TAURI_INTERNALS__) {
          const { listen } = await import('@tauri-apps/api/event')
          unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
          unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
          unlistenDone = await listen('upgrade-done', (e) => { cleanup(); modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.uninstallDone')) })
          unlistenError = await listen('upgrade-error', (e) => { cleanup(); modal.setError(t('about.uninstallFailed') + (e.payload || t('common.unknown'))) })
          await api.uninstallOpenclaw(false)
          modal.appendLog(t('about.uninstallTaskStarted'))
        } else {
          const msg = await api.uninstallOpenclaw(false)
          modal.setDone(typeof msg === 'string' ? msg : t('about.uninstallDone'))
          cleanup()
        }
      } catch (e) {
        cleanup()
        modal.setError(t('about.uninstallFailed') + (e?.message || e))
      }
    })
  } catch {
    cards.innerHTML = `<div class="stat-cards"><div class="stat-card"><div class="stat-card-label">${t('common.loadFailed')}</div></div></div>`
  }
}

async function showVersionPicker(page, currentVersion) {
  const isInstalled = !!currentVersion.current
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-title">${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}</div>
      <div style="display:flex;flex-direction:column;gap:16px;margin:16px 0">
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.versionLabel')}</label>
          <div style="display:flex;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center" id="lbl-official">
              <input type="radio" name="oc-source" value="official" ${currentVersion.source !== 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">${t('about.official')}
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center" id="lbl-chinese">
              <input type="radio" name="oc-source" value="chinese" ${currentVersion.source === 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">${t('about.chinese')}
            </label>
          </div>
        </div>
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.selectVersion')}</label>
          <select id="oc-version-select" class="input" style="width:100%;padding:8px 12px;font-size:var(--font-size-sm)"><option value="">${t('common.loading')}</option></select>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6;padding:10px 12px;border-radius:8px;background:var(--bg-tertiary)">${t('about.versionPickerHint')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;min-height:18px">
          <div id="oc-action-hint" style="font-size:var(--font-size-xs);color:var(--text-tertiary)"></div>
          <div id="nightly-toggle" style="display:none"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary btn-sm" data-action="confirm" disabled id="oc-confirm-btn">${isInstalled ? t('about.btnSwitch') : t('about.btnInstall')}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const select = overlay.querySelector('#oc-version-select')
  const confirmBtn = overlay.querySelector('#oc-confirm-btn')
  const hintEl = overlay.querySelector('#oc-action-hint')
  const radios = overlay.querySelectorAll('input[name="oc-source"]')
  const lblChinese = overlay.querySelector('#lbl-chinese')
  const lblOfficial = overlay.querySelector('#lbl-official')
  const close = () => overlay.remove()
  overlay.querySelector('[data-action="cancel"]').onclick = close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })

  let versionsCache = {}
  let currentSelect = currentVersion.source === 'chinese' ? 'chinese' : 'official'
  let showNightly = false

  function updateRadioStyle() {
    const sel = currentSelect
    lblChinese.style.borderColor = sel !== 'official' ? 'var(--primary)' : 'var(--border)'
    lblChinese.style.background = sel !== 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
    lblOfficial.style.borderColor = sel === 'official' ? 'var(--primary)' : 'var(--border)'
    lblOfficial.style.background = sel === 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
  }

  function updateHint() {
    const targetSource = currentSelect
    const targetVer = select.value
    if (!targetVer || targetVer === '') { hintEl.textContent = ''; confirmBtn.disabled = true; return }
    const targetTag = select.selectedIndex === 0 ? t('about.tagRecommended') : t('about.tagNeedTest')
    const sameSource = targetSource === currentVersion.source
    if (!isInstalled) {
      confirmBtn.textContent = t('about.btnInstall')
      hintEl.textContent = t('about.hintInstall', { source: targetSource === 'official' ? t('about.official') : t('about.chinese'), ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
      return
    }
    if (!sameSource) {
      confirmBtn.textContent = t('about.btnSwitch')
      hintEl.innerHTML = `${t('about.hintCurrent')}: <strong>${currentVersion.source === 'official' ? t('about.official') : t('about.chinese')} ${currentVersion.current}</strong> → <strong>${targetSource === 'official' ? t('about.official') : t('about.chinese')} ${targetVer}</strong>${targetTag}`
      confirmBtn.disabled = false
      return
    }
    const parseVer = v => v.split(/[^0-9]/).filter(Boolean).map(Number)
    const cur = parseVer(currentVersion.current)
    const tgt = parseVer(targetVer)
    let cmp = 0
    for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
      if ((tgt[i] || 0) > (cur[i] || 0)) { cmp = 1; break }
      if ((tgt[i] || 0) < (cur[i] || 0)) { cmp = -1; break }
    }
    if (cmp === 0) {
      confirmBtn.textContent = t('about.btnReinstall')
      hintEl.textContent = t('about.hintAlreadyVersion', { ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
    } else if (cmp > 0) {
      confirmBtn.textContent = t('about.btnUpgrade')
      hintEl.innerHTML = `<span style="color:var(--accent)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    } else {
      confirmBtn.textContent = t('about.btnDowngrade')
      hintEl.innerHTML = `<span style="color:var(--warning)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    }
  }

  async function loadVersions(source) {
    select.innerHTML = `<option value="">${t('common.loading')}</option>`
    confirmBtn.disabled = true
    hintEl.textContent = ''
    try {
      if (!versionsCache[source]) {
        versionsCache[source] = await api.listOpenclawVersions(source)
      }
      const allVersions = versionsCache[source]
      if (!allVersions.length) { select.innerHTML = `<option value="">${t('about.noVersions')}</option>`; return }
      const stable = allVersions.filter(v => !v.includes('nightly') && !v.includes('canary') && !v.includes('alpha') && !v.includes('beta') && !v.includes('rc') && !v.includes('dev') && !v.includes('next'))
      const versions = showNightly ? allVersions : (stable.length > 0 ? stable : allVersions)
      const nightlyCount = allVersions.length - stable.length
      select.innerHTML = versions.map((v, idx) => {
        const isCurrent = isInstalled && v === currentVersion.current && source === currentVersion.source
        return `<option value="${v}">${v}${idx === 0 ? ` (${t('about.recommended')})` : ''}${isCurrent ? ` (${t('about.current')})` : ''}</option>`
      }).join('')
      const toggleEl = overlay.querySelector('#nightly-toggle')
      if (toggleEl) {
        if (nightlyCount > 0) {
          toggleEl.style.display = ''
          toggleEl.innerHTML = showNightly
            ? `<a href="#" id="btn-toggle-nightly" style="color:var(--primary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.hidePreview', { count: nightlyCount })}</a>`
            : `<a href="#" id="btn-toggle-nightly" style="color:var(--text-tertiary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.showPreview', { count: nightlyCount })}</a>`
          toggleEl.querySelector('#btn-toggle-nightly').onclick = (e) => { e.preventDefault(); showNightly = !showNightly; loadVersions(source) }
        } else { toggleEl.style.display = 'none' }
      }
      updateHint()
    } catch (e) { select.innerHTML = `<option value="">${t('common.loadFailed')}: ${e.message || e}</option>` }
  }

  radios.forEach(radio => {
    radio.addEventListener('change', () => { currentSelect = radio.value; updateRadioStyle(); loadVersions(currentSelect) })
  })
  select.addEventListener('change', updateHint)
  confirmBtn.onclick = () => { const src = currentSelect; const ver = select.value; close(); doInstall(page, `${confirmBtn.textContent} OpenClaw`, src, ver) }
  updateRadioStyle()
  loadVersions(currentSelect)
}

async function doInstall(page, title, source, version) {
  const modal = showUpgradeModal(title)
  modal.onClose(() => loadVersionCards(page))
  let unlistenLog, unlistenProgress, unlistenDone, unlistenError
  setUpgrading(true)
  const cleanup = () => { setUpgrading(false); unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
  try {
    if (window.__TAURI_INTERNALS__) {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
      unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
      unlistenDone = await listen('upgrade-done', (e) => { cleanup(); modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.operationDone')) })
      unlistenError = await listen('upgrade-error', async (e) => {
        cleanup()
        const errStr = String(e.payload || t('common.unknown'))
        modal.appendLog(errStr)
        const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
        const fullLog = modal.getLogText() + '\n' + errStr
        const diagnosis = diagnoseInstallError(fullLog)
        modal.setError(diagnosis.title)
        if (diagnosis.hint) { modal.appendLog(''); modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`) }
        if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
        if (window.__openAIDrawerWithError) { window.__openAIDrawerWithError({ title: diagnosis.title, error: fullLog, scene: title, hint: diagnosis.hint }) }
      })
      await api.upgradeOpenclaw(source, version)
      modal.appendLog(t('about.taskStarted'))
    } else {
      modal.appendLog(t('about.webModeNoLog'))
      const msg = await api.upgradeOpenclaw(source, version)
      modal.setDone(typeof msg === 'string' ? msg : (msg?.message || t('about.operationDone')))
      cleanup()
    }
  } catch (e) {
    cleanup()
    const errStr = String(e)
    modal.appendLog(errStr)
    const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
    const fullLog = modal.getLogText() + '\n' + errStr
    const diagnosis = diagnoseInstallError(fullLog)
    modal.setError(diagnosis.title)
  }
}

// ===== Gateway 服务管理 =====

async function loadServices(page) {
  const container = page.querySelector('#services-list')
  try {
    const services = await api.getServicesStatus()
    renderServices(container, services)
    const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
    if (gw) { maybeShowForeignGatewayBindingPrompt({ service: gw, onRefresh: () => loadServices(page) }).catch(() => {}) }
  } catch (e) {
    container.innerHTML = `<div style="color:var(--error)">${t('services.serviceLoadFailed')}: ${escapeHtml(String(e))}</div>`
  }
}

function renderServices(container, services) {
  const gw = services.find(s => s.label === 'ai.openclaw.gateway')
  let html = ''
  if (gw) {
    const cliMissing = gw.cli_installed === false
    const foreignGateway = !cliMissing && isForeignGatewayService(gw)
    const foreignPidText = gw.pid ? ` (PID: ${gw.pid})` : ''
    html += `
    <div class="service-card" data-label="${gw.label}">
      <div class="service-info">
        <span class="status-dot ${cliMissing ? 'stopped' : foreignGateway ? 'warning' : gw.running ? 'running' : 'stopped'}"></span>
        <div>
          <div class="service-name">${gw.label}</div>
          <div class="service-desc">${cliMissing
            ? t('services.cliNotInstalled')
            : foreignGateway
              ? t('services.foreignGatewayDesc', { pid: foreignPidText, settings: t('sidebar.settings') })
            : (gw.description || '') + (gw.pid ? ' (PID: ' + gw.pid + ')' : '')
          }</div>
        </div>
      </div>
      <div class="service-actions">
        ${cliMissing
          ? `<div style="display:flex;flex-direction:column;gap:var(--space-xs);align-items:flex-end">
               <div style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('services.installCliHint')}</div>
               <code style="font-size:var(--font-size-xs);background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;user-select:all">npm install -g @Agent Planet Systems/openclaw-zh</code>
               <button class="btn btn-secondary btn-sm" data-action="refresh-services" style="margin-top:4px">${t('services.refreshStatus')}</button>
             </div>`
          : foreignGateway
            ? `<div style="display:flex;flex-direction:column;gap:var(--space-xs);align-items:flex-end">
                 <div style="color:var(--warning);font-size:var(--font-size-xs);max-width:320px;text-align:right">${t('services.foreignGatewayHint')}</div>
                 <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                   <button class="btn btn-primary btn-sm" data-action="claim-gateway">${t('services.claimGateway')}</button>
                   <button class="btn btn-secondary btn-sm" data-action="resolve-foreign-gateway">${t('dashboard.viewGuidance')}</button>
                   <button class="btn btn-secondary btn-sm" data-action="refresh-services">${t('services.refreshStatus')}</button>
                 </div>
               </div>`
          : gw.running
            ? `<button class="btn btn-secondary btn-sm" data-action="restart" data-label="${gw.label}">${t('services.restart')}</button>
               <button class="btn btn-danger btn-sm" data-action="stop" data-label="${gw.label}">${t('services.stop')}</button>
               ${isMacPlatform() ? `<button class="btn btn-danger btn-sm" data-action="uninstall-gateway">${t('services.uninstall')}</button>` : ''}`
            : `<button class="btn btn-primary btn-sm" data-action="start" data-label="${gw.label}">${t('services.start')}</button>
               ${isMacPlatform() ? `<button class="btn btn-primary btn-sm" data-action="install-gateway">${t('services.install')}</button><button class="btn btn-danger btn-sm" data-action="uninstall-gateway">${t('services.uninstall')}</button>` : ''}`
        }
      </div>
    </div>`
  } else {
    html += `
    <div class="service-card">
      <div class="service-info">
        <span class="status-dot stopped"></span>
        <div><div class="service-name">ai.openclaw.gateway</div><div class="service-desc">${t('services.gwNotInstalled')}</div></div>
      </div>
      <div class="service-actions">
        <button class="btn btn-primary btn-sm" data-action="install-gateway">${t('services.install')}</button>
      </div>
    </div>`
  }
  container.innerHTML = html
}

const ACTION_LABELS = { start: t('services.start'), stop: t('services.stop'), restart: t('services.restart') }
const POLL_INTERVAL = 1500
const POLL_TIMEOUT = 30000

async function handleServiceAction(action, label, page) {
  const fn = { start: api.startService, stop: api.stopService, restart: api.restartService }[action]
  const actionLabel = ACTION_LABELS[action]
  const expectRunning = action !== 'stop'
  if (action === 'stop') setUserStopped(true)
  if (action === 'start') resetAutoRestart()
  const card = page.querySelector(`.service-card[data-label="${label}"]`)
  const actionsEl = card?.querySelector('.service-actions')
  const origHtml = actionsEl?.innerHTML || ''
  let cancelled = false
  if (actionsEl) {
    actionsEl.innerHTML = `<div class="service-loading"><div class="service-spinner"></div><span class="service-loading-text">${t('services.actionProgress', { action: actionLabel })}</span><button class="btn btn-sm btn-ghost service-cancel-btn" style="display:none">${t('services.cancelWait')}</button></div>`
    const cancelBtn = actionsEl.querySelector('.service-cancel-btn')
    if (cancelBtn) cancelBtn.addEventListener('click', () => { cancelled = true })
  }
  const dot = card?.querySelector('.status-dot')
  if (dot) dot.className = 'status-dot loading'
  try {
    await fn(label)
  } catch (e) {
    if (isForeignGatewayError(e)) { await openGatewayConflict(page, e) }
    else { toast(t('services.actionCmdFailed', { action: actionLabel, error: e.message || e }), 'error') }
    if (actionsEl) actionsEl.innerHTML = origHtml
    if (dot) dot.className = 'status-dot stopped'
    return
  }
  const startTime = Date.now()
  let showedCancel = false
  const loadingText = actionsEl?.querySelector('.service-loading-text')
  const cancelBtn = actionsEl?.querySelector('.service-cancel-btn')
  while (!cancelled) {
    const elapsed = Date.now() - startTime
    if (!showedCancel && elapsed > 5000 && cancelBtn) { cancelBtn.style.display = ''; showedCancel = true }
    if (loadingText) { const sec = Math.floor(elapsed / 1000); loadingText.textContent = t('services.actionProgressSec', { action: actionLabel, sec }) }
    if (elapsed > POLL_TIMEOUT) { toast(t('services.actionTimeout', { action: actionLabel }), 'warning'); break }
    try {
      const services = await api.getServicesStatus()
      const svc = services?.find?.(s => s.label === label) || services?.[0]
      if (svc && svc.running === expectRunning) {
        toast(t('services.actionDone', { label, action: actionLabel }) + (svc.pid ? ' (PID: ' + svc.pid + ')' : ''), 'success')
        import('../lib/app-state.js').then(m => m.refreshGatewayStatus()).catch(() => {})
        await loadServices(page)
        return
      }
    } catch {}
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  if (cancelled) toast(t('services.cancelled'), 'info')
  await loadServices(page)
}

async function openGatewayConflict(page, error = null) {
  const services = await api.getServicesStatus().catch(() => [])
  const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
  await showGatewayConflictGuidance({ error, service: gw, onRefresh: async () => { await loadVersionCards(page); await loadServices(page) } })
}

// ===== Docker 管理 =====

function configuredDockerImage(panelConfig) {
  return (panelConfig?.dockerDefaultImage || '').trim() || 'ghcr.io/Agent Planet Systems/openclaw'
}

function formatDockerBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function parseOptionalPort(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const num = Number(raw)
  if (!Number.isInteger(num) || num < 1 || num > 65535) throw new Error(t('services.invalidPort', { value: raw }))
  return num
}

async function hasDockerManagerBackend() {
  try {
    const resp = await fetch('/__api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const ct = (resp.headers.get('content-type') || '').toLowerCase()
    return resp.ok && !ct.includes('text/html') && !ct.includes('text/plain')
  } catch { return false }
}

async function loadDockerManager(page) {
  const bar = page.querySelector('#docker-manager-bar')
  if (!bar) return
  const backendReady = await hasDockerManagerBackend()
  if (!backendReady) { bar.innerHTML = `<div class="stat-card"><div class="stat-card-meta">${t('services.dockerManagerUnavailable')}</div></div>`; return }
  try {
    const [overview, panelConfig] = await Promise.all([api.dockerClusterOverview(), api.readPanelConfig().catch(() => ({}))])
    const totalNodes = overview.length
    const onlineNodes = overview.filter(node => node.online).length
    const totalContainers = overview.reduce((sum, node) => sum + (node.containers?.length || 0), 0)
    const runningContainers = overview.reduce((sum, node) => sum + (node.containers?.filter?.(ct => ct.state === 'running').length || 0), 0)
    bar.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-md)">
        <div class="stat-card" style="padding:12px 16px;min-width:260px">
          <div class="stat-card-label">${t('services.dockerManager')}</div>
          <div class="stat-card-meta">${onlineNodes}/${totalNodes} ${t('services.dockerOnline')} · ${runningContainers}/${totalContainers} ${t('services.dockerContainersLabel')}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-action="docker-refresh">${t('services.dockerRefresh')}</button>
          <button class="btn btn-secondary btn-sm" data-action="docker-add-node">${t('services.dockerAddNode')}</button>
          <button class="btn btn-secondary btn-sm" data-action="docker-pull-image">${t('services.dockerPullAction')}</button>
          <button class="btn btn-primary btn-sm" data-action="docker-create-container">${t('services.dockerCreateContainer')}</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-md)">
        ${overview.map(node => {
          const containers = node.containers || []
          const nodeMeta = node.online
            ? `${escapeHtml(node.endpoint || '')} · Docker ${escapeHtml(node.dockerVersion || t('common.unknown'))} · ${formatDockerBytes(node.memory)} · CPU ${node.cpus || 0}`
            : `${escapeHtml(node.endpoint || '')} · ${escapeHtml(node.error || t('services.dockerOffline'))}`
          return `
            <div class="service-card" data-docker-node="${escapeHtml(node.id)}" style="display:block">
              <div style="display:flex;justify-content:space-between;gap:var(--space-sm);align-items:flex-start;flex-wrap:wrap">
                <div class="service-info">
                  <span class="status-dot ${node.online ? 'running' : 'stopped'}"></span>
                  <div>
                    <div class="service-name">${escapeHtml(node.name)}${node.id === 'local' ? ` <span class="clawhub-badge" style="margin-left:6px;background:rgba(99,102,241,0.14);color:#6366f1">${t('services.dockerLocalNode')}</span>` : ''}</div>
                    <div class="service-desc">${nodeMeta}</div>
                    <div class="service-desc">${node.online ? `${t('services.dockerContainersLabel')}: ${node.runningContainers || 0}/${node.totalContainers || containers.length}` : t('services.dockerOffline')}</div>
                  </div>
                </div>
                <div class="service-actions">${node.id !== 'local' ? `<button class="btn btn-danger btn-sm" data-action="docker-remove-node" data-node-id="${escapeHtml(node.id)}" data-name="${escapeHtml(node.name)}">${t('common.delete')}</button>` : ''}</div>
              </div>
              <div style="margin-top:var(--space-sm);display:flex;flex-direction:column;gap:8px">
                ${containers.length ? containers.map(ct => `
                  <div class="service-card" style="background:var(--bg-secondary);border:1px solid var(--border-primary)">
                    <div class="service-info">
                      <span class="status-dot ${ct.state === 'running' ? 'running' : 'stopped'}"></span>
                      <div>
                        <div class="service-name">${escapeHtml(ct.name)}</div>
                        <div class="service-desc">${escapeHtml(ct.image)} · ${escapeHtml(ct.status || ct.state || t('common.unknown'))}${ct.ports ? ` · ${escapeHtml(ct.ports)}` : ''}</div>
                      </div>
                    </div>
                    <div class="service-actions">
                      ${ct.state === 'running'
                        ? `<button class="btn btn-secondary btn-sm" data-action="docker-restart-container" data-node-id="${escapeHtml(node.id)}" data-container-id="${escapeHtml(ct.id)}" data-name="${escapeHtml(ct.name)}">${t('services.restart')}</button>
                           <button class="btn btn-secondary btn-sm" data-action="docker-stop-container" data-node-id="${escapeHtml(node.id)}" data-container-id="${escapeHtml(ct.id)}" data-name="${escapeHtml(ct.name)}">${t('services.stop')}</button>`
                        : `<button class="btn btn-primary btn-sm" data-action="docker-start-container" data-node-id="${escapeHtml(node.id)}" data-container-id="${escapeHtml(ct.id)}" data-name="${escapeHtml(ct.name)}">${t('services.start')}</button>`}
                      <button class="btn btn-danger btn-sm" data-action="docker-remove-container" data-node-id="${escapeHtml(node.id)}" data-container-id="${escapeHtml(ct.id)}" data-name="${escapeHtml(ct.name)}" data-running="${ct.state === 'running' ? '1' : ''}">${t('common.delete')}</button>
                    </div>
                  </div>
                `).join('') : `<div class="form-hint" style="padding:4px 0">${t('services.dockerNoContainers')}</div>`}
              </div>
            </div>`
        }).join('')}
      </div>
      <div class="form-hint" style="margin-top:var(--space-sm)">${t('services.dockerDefaultImageHint')} <code>${escapeHtml(configuredDockerImage(panelConfig))}</code></div>`
  } catch (e) {
    bar.innerHTML = `<div class="stat-card"><div class="stat-card-meta" style="color:var(--error)">${t('services.dockerManagerLoadFailed')}: ${escapeHtml(e?.message || e)}</div></div>`
  }
}

async function openDockerAddNode(page) {
  showModal({
    title: t('services.dockerAddNode'),
    fields: [
      { name: 'name', label: t('services.dockerNodeName'), value: '', placeholder: 'docker-node-1' },
      { name: 'endpoint', label: t('services.dockerNodeEndpoint'), value: '', placeholder: 'tcp://192.168.1.20:2375' },
    ],
    onConfirm: async ({ name, endpoint }) => {
      try { await api.dockerAddNode((name || '').trim(), (endpoint || '').trim()); toast(t('services.dockerNodeAdded'), 'success'); await loadDockerManager(page) }
      catch (e) { toast(e?.message || e, 'error') }
    },
  })
}

async function openDockerPullImage(page) {
  const [nodes, panelConfig] = await Promise.all([api.dockerListNodes(), api.readPanelConfig().catch(() => ({}))])
  showModal({
    title: t('services.dockerPullTitle'),
    fields: [
      { name: 'nodeId', type: 'select', label: t('services.dockerNodeName'), value: nodes[0]?.id || 'local', options: nodes.map(node => ({ value: node.id, label: node.name })) },
      { name: 'image', label: t('services.dockerImageLabel'), value: configuredDockerImage(panelConfig), hint: t('services.dockerDefaultImageHint') },
      { name: 'tag', label: t('services.dockerTagLabel'), value: 'latest' },
    ],
    onConfirm: async ({ nodeId, image, tag }) => {
      const requestId = `pull-${Date.now()}`
      const modal = showUpgradeModal(t('services.dockerPullTitle'))
      let lastMessage = ''
      const timer = setInterval(async () => {
        try { const status = await api.dockerPullStatus(requestId); if (Number.isFinite(status?.percent)) modal.setProgress(status.percent); if (status?.message && status.message !== lastMessage) { lastMessage = status.message; modal.appendLog(status.message) } } catch {}
      }, 800)
      try {
        const result = await api.dockerPullImage({ nodeId: nodeId || null, image: (image || '').trim() || configuredDockerImage(panelConfig), tag: (tag || '').trim() || 'latest', requestId })
        clearInterval(timer); modal.setProgress(100)
        if (result?.message) modal.appendLog(result.message)
        modal.setDone(t('services.dockerPullDone')); toast(t('services.dockerPullDone'), 'success'); await loadDockerManager(page)
      } catch (e) { clearInterval(timer); modal.appendLog(e?.message || String(e)); modal.setError(e?.message || String(e)); toast(e?.message || e, 'error') }
    },
  })
}

async function openDockerCreateContainer(page) {
  const [nodes, panelConfig] = await Promise.all([api.dockerListNodes(), api.readPanelConfig().catch(() => ({}))])
  showModal({
    title: t('services.dockerCreateTitle'),
    fields: [
      { name: 'nodeId', type: 'select', label: t('services.dockerNodeName'), value: nodes[0]?.id || 'local', options: nodes.map(node => ({ value: node.id, label: node.name })) },
      { name: 'name', label: t('services.dockerContainerNameLabel'), value: '', placeholder: 'openclaw-worker-1' },
      { name: 'image', label: t('services.dockerImageLabel'), value: configuredDockerImage(panelConfig), hint: t('services.dockerDefaultImageHint') },
      { name: 'tag', label: t('services.dockerTagLabel'), value: 'latest' },
      { name: 'panelPort', label: t('services.dockerPanelPortLabel'), value: '1420', hint: t('services.dockerPortOptionalHint') },
      { name: 'gatewayPort', label: t('services.dockerGatewayPortLabel'), value: '18789', hint: t('services.dockerPortOptionalHint') },
      { name: 'volume', type: 'checkbox', label: t('services.dockerUseVolume'), value: true },
    ],
    onConfirm: async ({ nodeId, name, image, tag, panelPort, gatewayPort, volume }) => {
      try { await api.dockerCreateContainer({ nodeId: nodeId || null, name: (name || '').trim() || undefined, image: (image || '').trim() || configuredDockerImage(panelConfig), tag: (tag || '').trim() || 'latest', panelPort: parseOptionalPort(panelPort), gatewayPort: parseOptionalPort(gatewayPort), volume: !!volume }); toast(t('services.dockerContainerCreated'), 'success'); await loadDockerManager(page) }
      catch (e) { toast(e?.message || e, 'error') }
    },
  })
}

async function handleDockerRemoveNode(btn, page) {
  const name = btn.dataset.name || btn.dataset.nodeId || ''
  const yes = await showConfirm(t('services.dockerRemoveNodeConfirm', { name }))
  if (!yes) return
  await api.dockerRemoveNode(btn.dataset.nodeId)
  toast(t('services.dockerNodeRemoved'), 'success')
  await loadDockerManager(page)
}

async function handleDockerContainerAction(action, btn, page) {
  const nodeId = btn.dataset.nodeId || null
  const containerId = btn.dataset.containerId
  const name = btn.dataset.name || containerId
  if (!containerId) throw new Error(t('services.missingContainerId'))
  if (action === 'docker-remove-container') {
    const yes = await showConfirm(t('services.dockerRemoveContainerConfirm', { name }))
    if (!yes) return
    await api.dockerRemoveContainer(nodeId, containerId, btn.dataset.running === '1')
    toast(t('services.dockerContainerRemoved'), 'success')
    await loadDockerManager(page)
    return
  }
  const label = { 'docker-start-container': t('services.start'), 'docker-stop-container': t('services.stop'), 'docker-restart-container': t('services.restart') }[action]
  const fn = { 'docker-start-container': api.dockerStartContainer, 'docker-stop-container': api.dockerStopContainer, 'docker-restart-container': api.dockerRestartContainer }[action]
  await fn(nodeId, containerId)
  toast(t('services.actionDone', { label: name, action: label }), 'success')
  await loadDockerManager(page)
}

// ===== 备份管理 =====

async function loadBackups(page) {
  const list = page.querySelector('#backup-list')
  try {
    const backups = await api.listBackups()
    renderBackups(list, backups)
  } catch (e) { list.innerHTML = `<div style="color:var(--error)">${t('services.backupLoadFailed')}: ${e}</div>` }
}

function renderBackups(container, backups) {
  if (!backups || !backups.length) { container.innerHTML = `<div style="color:var(--text-tertiary);padding:var(--space-md) 0">${t('services.noBackup')}</div>`; return }
  container.innerHTML = backups.map(b => {
    const date = b.created_at ? new Date(b.created_at * 1000).toLocaleString() : t('common.unknown')
    const size = b.size ? (b.size / 1024).toFixed(1) + ' KB' : ''
    return `<div class="service-card" data-backup="${b.name}"><div class="service-info"><div><div class="service-name">${b.name}</div><div class="service-desc">${date}${size ? ' · ' + size : ''}</div></div></div><div class="service-actions"><button class="btn btn-primary btn-sm" data-action="restore-backup" data-name="${b.name}">${t('services.restore')}</button><button class="btn btn-danger btn-sm" data-action="delete-backup" data-name="${b.name}">${t('common.delete')}</button></div></div>`
  }).join('')
}

async function handleCreateBackup(page) {
  const result = await api.createBackup()
  toast(t('services.backupCreated', { name: result.name }), 'success')
  await loadBackups(page)
}

async function handleRestoreBackup(name, page) {
  const yes = await showConfirm(t('services.restoreConfirm', { name }))
  if (!yes) return
  await api.restoreBackup(name)
  toast(t('services.restored'), 'success')
  await loadBackups(page)
}

async function handleDeleteBackup(name, page) {
  const yes = await showConfirm(t('services.deleteConfirm', { name }))
  if (!yes) return
  await api.deleteBackup(name)
  toast(t('services.backupDeleted'), 'success')
  await loadBackups(page)
}

// ===== 配置文件编辑器 =====

let _configOriginal = ''

async function loadConfigEditor(page) {
  const section = page.querySelector('#config-editor-section')
  const area = page.querySelector('#config-editor-area')
  const status = page.querySelector('#config-editor-status')
  const btnSave = page.querySelector('[data-action="save-config"]')
  const btnSaveOnly = page.querySelector('[data-action="save-config-only"]')
  try {
    const config = await api.readOpenclawConfig()
    const json = JSON.stringify(config, null, 2)
    _configOriginal = json
    area.value = json; area.disabled = false; btnSave.disabled = false; btnSaveOnly.disabled = false; section.style.display = ''
    status.innerHTML = `<span style="color:var(--text-tertiary)">${t('services.configLoaded')} · ${(json.length / 1024).toFixed(1)} KB</span>`
    area.oninput = () => {
      try {
        JSON.parse(area.value)
        const changed = area.value !== _configOriginal
        status.innerHTML = changed ? `<span style="color:var(--warning)">● ${t('services.configUnsaved')}</span>` : `<span style="color:var(--text-tertiary)">${t('services.configNoChange')}</span>`
        btnSave.disabled = !changed; btnSaveOnly.disabled = !changed
      } catch (e) { status.innerHTML = `<span style="color:var(--error)">${t('services.configJsonError')}: ${e.message.split(' at ')[0]}</span>`; btnSave.disabled = true; btnSaveOnly.disabled = true }
    }
  } catch { section.style.display = 'none' }
}

async function handleSaveConfig(page, restart) {
  const area = page.querySelector('#config-editor-area')
  const status = page.querySelector('#config-editor-status')
  let config
  try { config = JSON.parse(area.value) } catch (e) { toast(t('services.configSaveJsonError'), 'error'); return }
  status.innerHTML = `<span style="color:var(--text-tertiary)">${t('services.autoBackingUp')}</span>`
  try { await api.createBackup() } catch (e) { const yes = await showConfirm(t('services.autoBackupFailed') + ': ' + e + '\n\n' + t('services.continueWithoutBackup')); if (!yes) return }
  status.innerHTML = `<span style="color:var(--text-tertiary)">${t('services.saving')}</span>`
  try {
    await api.writeOpenclawConfig(config)
    _configOriginal = area.value
    toast(restart ? t('services.configSavedRestarting') : t('services.configSaved'), 'success')
    status.innerHTML = `<span style="color:var(--success)">${t('services.configSaved')}</span>`
    page.querySelector('[data-action="save-config"]').disabled = true
    page.querySelector('[data-action="save-config-only"]').disabled = true
    if (restart) {
      try { await api.restartGateway(); toast(t('services.gwRestarted'), 'success') } catch (e) { toast(t('services.configSavedGwFailed') + ': ' + e, 'warning') }
      await loadServices(page)
    }
    await loadBackups(page)
  } catch (e) { toast(t('common.saveFailed') + ': ' + e, 'error'); status.innerHTML = `<span style="color:var(--error)">${t('common.saveFailed')}: ${e}</span>` }
}

// ===== 配置校准 =====

function calibrationSourceLabel(source) {
  if (source === 'backup') return t('services.calibrationSourceBackup')
  if (source === 'current') return t('services.calibrationSourceCurrent')
  return t('services.calibrationSourceEmpty')
}

async function handleCalibrateConfig(page, mode) {
  const yes = await showConfirm(mode === 'reset' ? t('services.calibrateResetConfirm') : t('services.calibrateInheritConfirm'))
  if (!yes) return
  const status = page.querySelector('#config-calibration-status')
  if (status) status.innerHTML = `<span style="color:var(--text-tertiary)">${t('services.calibrating')}</span>`
  const result = await api.calibrateOpenclawConfig(mode)
  const summary = t('services.calibrationSummary', { mode: mode === 'reset' ? t('services.calibrateReset') : t('services.calibrateInherit'), source: calibrationSourceLabel(result?.source), count: String(result?.inheritedKeys?.length || 0) })
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : []
  if (status) status.innerHTML = `<span style="color:var(--success)">${escapeHtml(summary)}</span>${warnings.length ? `<br><span style="color:var(--warning)">${escapeHtml(warnings.join('；'))}</span>` : ''}`
  toast(t('services.calibrationDone') + ' · ' + summary, 'success')
  if (warnings.length) toast(warnings.join('；'), 'warning')
  await Promise.all([loadConfigEditor(page), loadBackups(page), loadServices(page)])
}

// ===== 升级/切换源 =====

async function doUpgradeWithModal(source, page, version = null, method = 'auto') {
  const modal = showUpgradeModal(t('services.upgradeTitle'))
  let unlistenLog, unlistenProgress, unlistenDone, unlistenError
  setUpgrading(true)
  const cleanup = () => { setUpgrading(false); unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
  try {
    if (window.__TAURI_INTERNALS__) {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
      unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
      unlistenDone = await listen('upgrade-done', (e) => { cleanup(); modal.setDone(typeof e.payload === 'string' ? e.payload : t('services.taskDone')); loadVersionCards(page) })
      unlistenError = await listen('upgrade-error', (e) => {
        cleanup(); const errStr = String(e.payload || t('common.error')); modal.appendLog(errStr)
        const fullLog = modal.getLogText() + '\n' + errStr; const diagnosis = diagnoseInstallError(fullLog)
        modal.setError(diagnosis.title)
        if (diagnosis.hint) { modal.appendLog(''); modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`) }
        if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
        if (window.__openAIDrawerWithError) { window.__openAIDrawerWithError({ title: diagnosis.title, error: fullLog, scene: t('services.upgradeScene'), hint: diagnosis.hint }) }
      })
      await api.upgradeOpenclaw(source, version, method)
      modal.appendLog(t('services.taskStarted'))
    } else {
      modal.appendLog(t('services.webModeNoLog'))
      const msg = await api.upgradeOpenclaw(source, version, method)
      modal.setDone(typeof msg === 'string' ? msg : (msg?.message || t('services.upgradeDone')))
      await loadVersionCards(page); cleanup()
    }
  } catch (e) { cleanup(); const errStr = String(e); modal.appendLog(errStr); const fullLog = modal.getLogText() + '\n' + errStr; const diagnosis = diagnoseInstallError(fullLog); modal.setError(diagnosis.title) }
}

async function handleUpgrade(btn, page) {
  const sourceLabel = detectedSource === 'official' ? t('services.officialEdition') : t('services.chineseEdition')
  const recommended = lastVersionInfo?.recommended
  const yes = await showConfirm(t('services.upgradeConfirm', { source: sourceLabel, version: recommended ? ` (${recommended})` : '' }))
  if (!yes) return
  await doUpgradeWithModal(detectedSource, page, recommended || null)
}

async function handleSwitchSource(target, page) {
  const targetLabel = target === 'official' ? t('services.officialEdition') : t('services.chineseEdition')
  const yes = await showConfirm(t('services.switchSourceConfirm', { target: targetLabel }))
  if (!yes) return
  await doUpgradeWithModal(target, page, null)
}

// ===== Gateway 认领/安装/卸载 =====

async function handleClaimGateway(btn, page) {
  btn.classList.add('btn-loading'); btn.textContent = t('common.processing')
  try {
    await api.claimGateway(); toast(t('services.claimSuccess'), 'success')
    const { refreshGatewayStatus } = await import('../lib/app-state.js'); await refreshGatewayStatus(); await loadServices(page)
  } catch (e) { toast(t('services.claimFailed') + ': ' + e, 'error'); btn.classList.remove('btn-loading'); btn.textContent = t('services.claimGateway') }
}

async function handleInstallGateway(btn, page) {
  btn.classList.add('btn-loading'); btn.textContent = t('services.installing')
  try { await api.installGateway(); toast(t('services.gwInstalled'), 'success'); await loadServices(page) }
  catch (e) { toast(t('services.installFailed') + ': ' + e, 'error'); btn.classList.remove('btn-loading'); btn.textContent = t('services.install') }
}

async function handleUninstallGateway(btn, page) {
  const yes = await showConfirm(t('services.uninstallConfirm'))
  if (!yes) return
  btn.classList.add('btn-loading'); btn.textContent = t('services.uninstalling')
  try { await api.uninstallGateway(); toast(t('services.gwUninstalled'), 'success'); await loadServices(page) }
  catch (e) { toast(t('services.uninstallFailed') + ': ' + e, 'error'); btn.classList.remove('btn-loading'); btn.textContent = t('services.uninstall') }
}

// ===== 从 settings.js 迁移的环境配置卡片 =====

async function loadRegistry(page) {
  const bar = page.querySelector('#registry-bar')
  if (!bar) return
  try {
    const current = await api.getNpmRegistry()
    const isPreset = REGISTRIES.some(r => r.value === current)
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
        <select class="form-input" data-name="registry" style="max-width:320px">
          ${REGISTRIES.map(r => `<option value="${r.value}" ${r.value === current ? 'selected' : ''}>${typeof r.label === 'function' ? r.label() : r.label}</option>`).join('')}
          <option value="custom" ${!isPreset ? 'selected' : ''}>${t('settings.registryCustom')}</option>
        </select>
        <input class="form-input" data-name="custom-registry" placeholder="https://..." value="${isPreset ? '' : escapeHtml(current)}" style="max-width:320px;${isPreset ? 'display:none' : ''}">
        <button class="btn btn-primary btn-sm" data-action="save-registry">${t('common.save')}</button>
      </div>
      <div class="form-hint" style="margin-top:var(--space-xs)">${t('settings.registryHint')}</div>`
    const select = bar.querySelector('[data-name="registry"]')
    const customInput = bar.querySelector('[data-name="custom-registry"]')
    select.onchange = () => { customInput.style.display = select.value === 'custom' ? '' : 'none' }
  } catch (e) { bar.innerHTML = `<div style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(String(e))}</div>` }
}

async function handleSaveRegistry(page) {
  const select = page.querySelector('[data-name="registry"]')
  const customInput = page.querySelector('[data-name="custom-registry"]')
  const registry = select.value === 'custom' ? customInput.value.trim() : select.value
  if (!registry) { toast(t('settings.registryEmpty'), 'error'); return }
  await api.setNpmRegistry(registry)
  toast(t('settings.registrySaved'), 'success')
}

async function loadOpenclawDir(page) {
  const bar = page.querySelector('#openclaw-dir-bar')
  if (!bar) return
  try {
    const info = await api.getOpenclawDir()
    const cfg = await api.readPanelConfig()
    const customValue = cfg?.openclawDir || ''
    const statusText = info.configExists
      ? `<span style="color:var(--success)">${t('settings.configExists')}</span>`
      : `<span style="color:var(--warning)">${t('settings.configMissing')}</span>`
    bar.innerHTML = `
      <div style="margin-bottom:var(--space-xs)">
        <span class="form-hint">${t('settings.currentPath')}:</span>
        <strong style="font-size:var(--font-size-sm)">${escapeHtml(info.path)}</strong>
        <span style="margin-left:var(--space-xs);font-size:var(--font-size-xs)">${statusText}</span>
        ${info.isCustom ? `<span class="clawhub-badge" style="margin-left:var(--space-xs);background:rgba(99,102,241,0.14);color:#6366f1;font-size:var(--font-size-xs)">${t('settings.customBadge')}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
        <input class="form-input" data-name="openclaw-dir" placeholder="${t('settings.dirPlaceholder')}" value="${escapeHtml(customValue)}" style="max-width:420px">
        <button class="btn btn-primary btn-sm" data-action="save-openclaw-dir">${t('common.save')}</button>
        ${info.isCustom ? `<button class="btn btn-secondary btn-sm" data-action="reset-openclaw-dir">${t('settings.resetDefault')}</button>` : ''}
      </div>
      <div class="form-hint" style="margin-top:var(--space-xs)">${t('settings.dirHint')}</div>`
  } catch (e) { bar.innerHTML = `<div style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(String(e))}</div>` }
}

async function handleSaveOpenclawDir(page) {
  const input = page.querySelector('[data-name="openclaw-dir"]')
  const value = (input?.value || '').trim()
  const cfg = await api.readPanelConfig()
  if (value) cfg.openclawDir = value; else delete cfg.openclawDir
  await api.writePanelConfig(cfg)
  await loadOpenclawDir(page); await loadCliBinding(page)
  const savedMsg = value ? t('settings.customPathSaved') : t('settings.defaultRestored')
  const refreshed = await maybeRefreshGatewayServiceBinding()
  if (refreshed) { toast(savedMsg, 'success'); return }
  await promptRestart(savedMsg)
}

async function handleResetOpenclawDir(page) {
  const cfg = await api.readPanelConfig(); delete cfg.openclawDir; await api.writePanelConfig(cfg)
  await loadOpenclawDir(page); await loadCliBinding(page)
  const refreshed = await maybeRefreshGatewayServiceBinding()
  if (refreshed) { toast(t('settings.defaultRestored'), 'success'); return }
  await promptRestart(t('settings.defaultRestored'))
}

async function loadOpenclawSearchPaths(page) {
  const bar = page.querySelector('#openclaw-search-bar')
  if (!bar) return
  try {
    const cfg = await api.readPanelConfig()
    const value = Array.isArray(cfg?.openclawSearchPaths) ? cfg.openclawSearchPaths.join('\n') : ''
    bar.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <textarea class="form-input" data-name="openclaw-search-paths" rows="4" placeholder="${t('settings.searchPathsPlaceholder')}" style="max-width:680px;min-height:108px;resize:vertical">${escapeHtml(value)}</textarea>
        <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="save-openclaw-search-paths">${t('common.save')}</button>
        </div>
      </div>
      <div class="form-hint" style="margin-top:var(--space-xs)">${t('settings.searchPathsHint')}</div>`
  } catch (e) { bar.innerHTML = `<div style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(String(e))}</div>` }
}

async function handleSaveOpenclawSearchPaths(page) {
  const input = page.querySelector('[data-name="openclaw-search-paths"]')
  const paths = parseOpenclawSearchPaths(input?.value || '')
  const cfg = await api.readPanelConfig()
  if (paths.length > 0) cfg.openclawSearchPaths = paths; else delete cfg.openclawSearchPaths
  await api.writePanelConfig(cfg)
  await loadOpenclawSearchPaths(page); await loadCliBinding(page)
  toast(paths.length > 0 ? t('settings.searchPathsSaved') : t('settings.searchPathsCleared'), 'success')
}

async function loadDockerDefaults(page) {
  const bar = page.querySelector('#docker-defaults-bar')
  if (!bar) return
  try {
    const cfg = await api.readPanelConfig()
    const endpoint = cfg?.dockerEndpoint || ''; const image = cfg?.dockerDefaultImage || ''
    const currentEndpoint = effectiveDockerEndpoint(cfg); const currentImage = effectiveDockerImage(cfg)
    bar.innerHTML = `
      <div style="margin-bottom:var(--space-xs);display:flex;flex-direction:column;gap:4px">
        <div><span class="form-hint">${t('settings.currentDefault')}:</span> <code style="font-size:var(--font-size-xs)">${escapeHtml(currentEndpoint)}</code></div>
        <div><span class="form-hint">${t('settings.dockerDefaultImage')}:</span> <code style="font-size:var(--font-size-xs)">${escapeHtml(currentImage)}</code></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <input class="form-input" data-name="docker-endpoint" placeholder="${t('settings.dockerEndpointPlaceholder')}" value="${escapeHtml(endpoint)}" style="max-width:680px">
        <input class="form-input" data-name="docker-default-image" placeholder="${t('settings.dockerDefaultImagePlaceholder')}" value="${escapeHtml(image)}" style="max-width:680px">
        <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-action="save-docker-defaults">${t('common.save')}</button>
        </div>
      </div>
      <div class="form-hint" style="margin-top:var(--space-xs)">${t('settings.dockerDefaultsHint')}</div>`
  } catch (e) { bar.innerHTML = `<div style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(String(e))}</div>` }
}

async function handleSaveDockerDefaults(page) {
  const endpointInput = page.querySelector('[data-name="docker-endpoint"]')
  const imageInput = page.querySelector('[data-name="docker-default-image"]')
  const endpoint = (endpointInput?.value || '').trim(); const image = (imageInput?.value || '').trim()
  const cfg = await api.readPanelConfig()
  if (endpoint) cfg.dockerEndpoint = endpoint; else delete cfg.dockerEndpoint
  if (image) cfg.dockerDefaultImage = image; else delete cfg.dockerDefaultImage
  await api.writePanelConfig(cfg); await loadDockerDefaults(page)
  toast(t('settings.dockerDefaultsSaved'), 'success')
}

async function loadCliBinding(page) {
  const bar = page.querySelector('#cli-binding-bar')
  if (!bar) return
  try {
    const version = await api.getVersionInfo()
    const cfg = await api.readPanelConfig()
    const boundPath = cfg?.openclawCliPath || ''
    const installations = dedupeOpenclawInstallations(version.all_installations || [])
    const currentPath = version.cli_path || ''
    const sourceLabel = (src) => ({ standalone: t('dashboard.cliSourceStandalone'), 'npm-zh': t('dashboard.cliSourceNpmZh'), 'npm-official': t('dashboard.cliSourceNpmOfficial'), 'npm-global': t('dashboard.cliSourceNpmGlobal') })[src] || t('dashboard.cliSourceUnknown')
    let html = `<div class="form-hint" style="margin-bottom:var(--space-sm)">${t('settings.cliBindHint')}</div>`
    if (currentPath) {
      html += `<div style="margin-bottom:var(--space-sm);font-size:var(--font-size-sm)">
        <span style="color:var(--text-secondary)">${t('settings.cliCurrent')}:</span>
        <code style="font-size:var(--font-size-xs)">${escapeHtml(currentPath)}</code>
        ${boundPath ? `<span class="clawhub-badge" style="margin-left:var(--space-xs);background:rgba(99,102,241,0.14);color:#6366f1;font-size:var(--font-size-xs)">${t('settings.cliBound')}</span>` : ''}
      </div>`
    }
    if (installations.length > 0) {
      html += '<div style="display:flex;flex-direction:column;gap:var(--space-xs)">'
      html += `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);${!boundPath ? 'background:var(--bg-active);border-color:var(--accent)' : ''}">
        <span style="flex:1;font-size:var(--font-size-sm)">${t('settings.cliAutoDetect')}</span>
        ${boundPath ? '<button class="btn btn-secondary btn-xs" data-action="unbind-cli">' + t('common.reset') + '</button>' : '<span style="color:var(--success);font-size:var(--font-size-xs)">✓ ' + t('settings.cliActive') + '</span>'}
      </div>`
      for (const inst of installations) {
        const isBound = boundPath && inst.path === boundPath
        html += `<div style="display:flex;align-items:center;gap:var(--space-sm);padding:6px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);${isBound ? 'background:var(--bg-active);border-color:var(--accent)' : ''}">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--font-size-xs);font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(inst.path)}">${escapeHtml(inst.path)}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${sourceLabel(inst.source)}${inst.version ? ' · v' + inst.version : ''}</div>
          </div>
          ${isBound ? '<span style="color:var(--success);font-size:var(--font-size-xs)">✓ ' + t('settings.cliBound') + '</span>' : `<button class="btn btn-secondary btn-xs" data-action="bind-cli" data-path="${escapeHtml(inst.path)}">${t('common.confirm')}</button>`}
        </div>`
      }
      html += '</div>'
    } else { html += `<div style="color:var(--text-tertiary);font-size:var(--font-size-sm)">${t('common.noData')}</div>` }
    bar.innerHTML = html
  } catch (e) { bar.innerHTML = `<div style="color:var(--error)">${t('common.loadFailed')}: ${escapeHtml(String(e))}</div>` }
}

async function handleBindCli(page, path) {
  if (!path) return
  const ok = await showConfirm(t('settings.cliSwitchConfirm'))
  if (!ok) return
  const cfg = await api.readPanelConfig(); cfg.openclawCliPath = path; await api.writePanelConfig(cfg)
  toast(t('common.saveSuccess'), 'success'); await loadCliBinding(page); await maybeRefreshGatewayServiceBinding()
}

async function handleUnbindCli(page) {
  const cfg = await api.readPanelConfig(); delete cfg.openclawCliPath; await api.writePanelConfig(cfg)
  toast(t('common.saveSuccess'), 'success'); await loadCliBinding(page); await maybeRefreshGatewayServiceBinding()
}

async function maybeRefreshGatewayServiceBinding() {
  if (!isMacPlatform()) return false
  const [versionInfo, dirInfo] = await Promise.all([api.getVersionInfo().catch(() => null), api.getOpenclawDir().catch(() => null)])
  if (!versionInfo?.cli_path || dirInfo?.configExists === false) return false
  const shouldRefresh = await showConfirm(t('settings.gatewayServiceRefreshConfirm'))
  if (!shouldRefresh) return false
  toast(t('settings.gatewayServiceRefreshing'), 'info')
  try {
    const services = await api.getServicesStatus().catch(() => [])
    const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
    const shouldStartAgain = gw?.running === true && gw?.owned_by_current_instance !== false
    await api.uninstallGateway().catch(() => {}); await api.installGateway()
    if (shouldStartAgain) await api.startService('ai.openclaw.gateway')
    toast(t('settings.gatewayServiceRefreshed'), 'success'); return true
  } catch (e) { toast(`${t('settings.gatewayServiceRefreshFailed')}: ${e?.message || e}`, 'warning'); return false }
}

async function promptRestart(msg) {
  if (!isTauri) { toast(msg, 'success'); return }
  const ok = await showConfirm(`${msg}\n\n${t('settings.restartConfirm')}`)
  if (ok) { toast(t('settings.restarting'), 'info'); try { await api.relaunchApp() } catch { toast(t('settings.restartFailed'), 'warning') } }
  else { toast(`${msg}, ${t('settings.effectNextLaunch')}`, 'success') }
}

// ===== Git 路径 =====

async function loadGitPath(page) {
  const bar = page.querySelector('#git-path-bar')
  if (!bar) return
  try {
    const gitInfo = await api.checkGit()
    const cfg = await api.readPanelConfig()
    const customValue = cfg?.gitPath || ''
    const invalidCustom = gitInfo.isCustom && !gitInfo.installed
    const statusText = gitInfo.installed
      ? `<span style="color:var(--success)">✓ ${escapeHtml(gitInfo.version || 'Git')}</span>`
      : invalidCustom
        ? `<span style="color:var(--error)">✗ ${t('settings.gitPathInvalid')}</span>`
        : `<span style="color:var(--error)">✗ Git ${t('setup.notInstalled')}</span>`
    const pathText = gitInfo.path ? `<span style="font-size:var(--font-size-xs);opacity:0.7">${escapeHtml(gitInfo.path)}</span>` : ''
    const customBadge = gitInfo.isCustom ? `<span class="badge" style="margin-left:6px;font-size:10px">${t('settings.customBadge')}</span>` : ''
    bar.innerHTML = `
      <div class="stat-card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          ${statusText}${customBadge}
        </div>
        ${pathText ? `<div style="margin-bottom:10px">${pathText}</div>` : ''}
        <p style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:12px;line-height:1.5">${t('settings.gitPathHint')}</p>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input class="input" data-name="git-path" value="${escapeHtml(customValue)}" placeholder="${t('settings.gitPathPlaceholder')}" style="flex:1;min-width:200px">
          <button class="btn btn-primary btn-sm" data-action="save-git-path">${t('common.save')}</button>
          <button class="btn btn-secondary btn-sm" data-action="reset-git-path">${t('settings.resetDefault')}</button>
          <button class="btn btn-secondary btn-sm" data-action="scan-git-paths">${t('settings.gitScan')}</button>
        </div>
        <div id="git-scan-results"></div>
      </div>`
  } catch (e) {
    bar.innerHTML = `<div class="stat-card" style="padding:16px;color:var(--error)">${e}</div>`
  }
}

async function handleSaveGitPath(page) {
  const input = page.querySelector('[data-name="git-path"]')
  const value = (input?.value || '').trim()
  const cfg = await api.readPanelConfig()
  if (value) {
    cfg.gitPath = value
  } else {
    delete cfg.gitPath
  }
  await api.writePanelConfig(cfg)
  const gitInfo = await api.checkGit()
  if (value && gitInfo.isCustom && !gitInfo.installed) {
    toast(t('settings.gitPathInvalid'), 'error')
  } else {
    toast(value ? t('settings.gitPathSaved') : t('settings.gitPathCleared'), 'success')
  }
  await loadGitPath(page)
}

async function handleScanGitPaths(page) {
  const container = page.querySelector('#git-scan-results')
  if (!container) return
  container.innerHTML = `<div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">${t('settings.gitScanning')}</div>`
  try {
    const results = await api.scanGitPaths()
    if (!results || results.length === 0) {
      container.innerHTML = `<div style="margin-top:10px;font-size:12px;color:var(--text-tertiary)">${t('settings.gitScanEmpty')}</div>`
      return
    }
    container.innerHTML = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${results.map(r =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 8px;background:var(--bg-tertiary);border-radius:var(--radius-sm)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</span>
        <span style="color:var(--text-tertiary);flex-shrink:0">${escapeHtml(r.version || '')}</span>
        <span class="badge" style="font-size:10px;flex-shrink:0">${escapeHtml(r.source)}</span>
        <button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:11px" data-action="use-scanned-git" data-git-path="${escapeHtml(r.path)}">${t('settings.gitScanUse')}</button>
      </div>`
    ).join('')}</div>`
  } catch (e) {
    container.innerHTML = `<div style="margin-top:10px;font-size:12px;color:var(--error)">${e}</div>`
  }
}

async function handleResetGitPath(page) {
  const cfg = await api.readPanelConfig()
  delete cfg.gitPath
  await api.writePanelConfig(cfg)
  toast(t('settings.gitPathCleared'), 'success')
  await loadGitPath(page)
}

// ===== 事件绑定 =====

function bindEvents(page) {
  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    btn.disabled = true
    try {
      switch (action) {
        case 'start': case 'stop': case 'restart':
          await handleServiceAction(action, btn.dataset.label, page); break
        case 'save-config': await handleSaveConfig(page, true); break
        case 'save-config-only': await handleSaveConfig(page, false); break
        case 'reload-config': await loadConfigEditor(page); break
        case 'calibrate-config-inherit': await handleCalibrateConfig(page, 'inherit'); break
        case 'calibrate-config-reset': await handleCalibrateConfig(page, 'reset'); break
        case 'create-backup': await handleCreateBackup(page); break
        case 'restore-backup': await handleRestoreBackup(btn.dataset.name, page); break
        case 'delete-backup': await handleDeleteBackup(btn.dataset.name, page); break
        case 'upgrade': await handleUpgrade(btn, page); break
        case 'switch-source': await handleSwitchSource(btn.dataset.source, page); break
        case 'install-gateway': await handleInstallGateway(btn, page); break
        case 'uninstall-gateway': await handleUninstallGateway(btn, page); break
        case 'refresh-services': await loadServices(page); break
        case 'claim-gateway': await handleClaimGateway(btn, page); break
        case 'resolve-foreign-gateway': await openGatewayConflict(page); break
        case 'docker-refresh': await loadDockerManager(page); break
        case 'docker-add-node': await openDockerAddNode(page); break
        case 'docker-pull-image': await openDockerPullImage(page); break
        case 'docker-create-container': await openDockerCreateContainer(page); break
        case 'docker-remove-node': await handleDockerRemoveNode(btn, page); break
        case 'docker-start-container': case 'docker-stop-container': case 'docker-restart-container': case 'docker-remove-container':
          await handleDockerContainerAction(action, btn, page); break
        case 'save-registry': await handleSaveRegistry(page); break
        case 'save-openclaw-dir': await handleSaveOpenclawDir(page); break
        case 'reset-openclaw-dir': await handleResetOpenclawDir(page); break
        case 'save-openclaw-search-paths': await handleSaveOpenclawSearchPaths(page); break
        case 'save-docker-defaults': await handleSaveDockerDefaults(page); break
        case 'bind-cli': await handleBindCli(page, btn.dataset.path); break
        case 'unbind-cli': await handleUnbindCli(page); break
        case 'save-git-path': await handleSaveGitPath(page); break
        case 'reset-git-path': await handleResetGitPath(page); break
        case 'scan-git-paths': await handleScanGitPaths(page); break
        case 'use-scanned-git':
          page.querySelector('[data-name="git-path"]').value = btn.dataset.gitPath || ''
          await handleSaveGitPath(page)
          break
      }
    } catch (e) { toast(e.toString(), 'error') }
    finally { btn.disabled = false }
  })
}
