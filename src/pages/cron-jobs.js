/**
 * Agent Planet 定时任务页面
 * 任务列表 + 创建/删除/暂停/恢复/立即执行
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

let _el = null
let _jobs = []

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('cronJobs.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-primary" data-action="job-add">${tl('cronJobs.addJob')}</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('cronJobs.jobName')}</th>
                <th>${tl('cronJobs.jobSchedule')}</th>
                <th>${tl('cronJobs.jobAction')}</th>
                <th>${tl('cronJobs.lastRun')}</th>
                <th>${tl('cronJobs.nextRun')}</th>
                <th>${tl('cronJobs.status')}</th>
                <th style="text-align:right">${tl('services.actions')}</th>
              </tr>
            </thead>
            <tbody id="job-table-body">
              <tr><td colspan="7"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  bindEvents(_el)
  loadJobs()
  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    const id = btn.dataset.id

    if (action === 'job-add') showJobForm()
    else if (action === 'job-edit') editJob(id)
    else if (action === 'job-delete') deleteJob(id)
    else if (action === 'job-pause') togglePause(id, true)
    else if (action === 'job-resume') togglePause(id, false)
    else if (action === 'job-run') runNow(id)
  })
}

async function loadJobs() {
  try {
    _jobs = await bridge.listCronJobs() || []
  } catch {
    _jobs = []
  }
  renderTable()
}

function renderTable() {
  const tbody = _el.querySelector('#job-table-body')
  if (!tbody) return

  if (!_jobs.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-text">${tl('cronJobs.noJobs')}</div></div></td></tr>`
    return
  }

  tbody.innerHTML = _jobs.map(j => {
    const statusCls = j.paused ? 'badge-warning' : 'badge-success'
    const statusText = j.paused ? tl('cronJobs.paused') : tl('cronJobs.running')
    return `
      <tr>
        <td style="font-weight:500">${escHtml(j.name || j.id)}</td>
        <td><code style="font-size:var(--font-size-xs)">${escHtml(j.schedule || '-')}</code></td>
        <td style="font-size:var(--font-size-sm)">${escHtml(j.action || '-')}</td>
        <td style="font-size:var(--font-size-xs)">${escHtml(formatTime(j.lastRun))}</td>
        <td style="font-size:var(--font-size-xs)">${escHtml(formatTime(j.nextRun))}</td>
        <td><span class="badge ${statusCls}">${statusText}</span></td>
        <td style="text-align:right">
          ${j.paused
            ? `<button class="btn btn-sm btn-secondary" data-action="job-resume" data-id="${escAttr(j.id)}" style="margin-right:4px">${tl('cronJobs.resumeJob')}</button>`
            : `<button class="btn btn-sm btn-secondary" data-action="job-pause" data-id="${escAttr(j.id)}" style="margin-right:4px">${tl('cronJobs.pauseJob')}</button>`
          }
          <button class="btn btn-sm btn-secondary" data-action="job-run" data-id="${escAttr(j.id)}" style="margin-right:4px">${tl('cronJobs.runNow')}</button>
          <button class="btn btn-sm btn-ghost" data-action="job-edit" data-id="${escAttr(j.id)}">${tl('common.edit')}</button>
          <button class="btn btn-sm btn-ghost" data-action="job-delete" data-id="${escAttr(j.id)}" style="color:var(--error)">${tl('common.delete')}</button>
        </td>
      </tr>
    `
  }).join('')
}

function showJobForm(job) {
  const isEdit = job != null
  const j = job || { id: '', name: '', schedule: '0 9 * * *', action: '', command: '' }

  showModal({
    title: isEdit ? tl('common.edit') : tl('cronJobs.addJob'),
    content: `
      <div class="form-group">
        <label class="form-label">${tl('cronJobs.jobName')}</label>
        <input class="input" id="jf-name" value="${escHtml(j.name || '')}" placeholder="每日备份" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('cronJobs.jobSchedule')}</label>
        <input class="input" id="jf-schedule" value="${escHtml(j.schedule || '')}" placeholder="0 9 * * *" />
        <div class="form-hint">cron: 分 时 日 月 周</div>
      </div>
      <div class="form-group">
        <label class="form-label">${tl('cronJobs.jobAction')}</label>
        <input class="input" id="jf-action" value="${escHtml(j.action || '')}" placeholder="backup" />
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-job-save">${tl('common.save')}</button>
    `
  })

  setTimeout(() => {
    document.getElementById('btn-job-save')?.addEventListener('click', async () => {
      const data = {
        id: isEdit ? j.id : Date.now().toString(36),
        name: document.getElementById('jf-name')?.value?.trim(),
        schedule: document.getElementById('jf-schedule')?.value?.trim(),
        action: document.getElementById('jf-action')?.value?.trim(),
      }
      if (!data.name) { toast(tl('cronJobs.jobName'), 'warn'); return }

      try {
        if (isEdit) await bridge.updateCronJob(data)
        else await bridge.createCronJob(data)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadJobs()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

function editJob(id) {
  const job = _jobs.find(j => j.id === id)
  if (job) showJobForm(job)
}

function deleteJob(id) {
  const job = _jobs.find(j => j.id === id)
  if (!job) return

  showModal({
    title: tl('cronJobs.deleteJob'),
    content: `<p>${tl('common.confirm')} ${escHtml(job.name)}？</p>`,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-danger" id="btn-job-del-confirm">${tl('common.delete')}</button>
    `
  })
  setTimeout(() => {
    document.getElementById('btn-job-del-confirm')?.addEventListener('click', async () => {
      try {
        await bridge.deleteCronJob(id)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadJobs()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

async function togglePause(id, pause) {
  try {
    await bridge.toggleCronJob(id, pause)
    toast(tl('common.success'), 'success')
    loadJobs()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

async function runNow(id) {
  const btn = _el.querySelector(`[data-action="job-run"][data-id="${escAttr(id)}"]`)
  if (btn) { btn.disabled = true; btn.textContent = '...' }
  try {
    await bridge.runCronJobNow(id)
    toast(tl('common.success'), 'success')
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
  if (btn) { btn.disabled = false; btn.textContent = tl('cronJobs.runNow') }
}

function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

export function cleanup() { _el = null; _jobs = [] }
