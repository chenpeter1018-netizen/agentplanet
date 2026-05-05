/**
 * Agent Planet 记忆文件管理页面
 * 分类浏览 + 创建/编辑/删除 + 导入导出
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

let _el = null
let _files = []
let _category = 'all'

const CATEGORIES = ['all', 'memory', 'user', 'project', 'rules', 'skills']

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('memoryFiles.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="mem-export">${tl('memoryFiles.exportZip')}</button>
        <button class="btn btn-secondary" data-action="mem-import">${tl('memoryFiles.importZip')}</button>
        <button class="btn btn-primary" data-action="mem-create">${tl('memoryFiles.createFile')}</button>
      </div>
    </div>

    <div class="tabs">
      ${CATEGORIES.map(c => `
        <button class="tab ${c === _category ? 'active' : ''}" data-mem-cat="${c}">
          ${c === 'all' ? tl('memoryFiles.allCategories') : tl(`memoryFiles.${c === 'skills' ? 'skillsCat' : c}`) || c}
        </button>
      `).join('')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('memoryFiles.fileName')}</th>
                <th>${tl('memoryFiles.filePath')}</th>
                <th>${tl('memoryFiles.category')}</th>
                <th>${tl('memoryFiles.lastModified')}</th>
                <th style="text-align:right">${tl('services.actions')}</th>
              </tr>
            </thead>
            <tbody id="mem-table-body">
              <tr><td colspan="5"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  bindEvents(_el)
  loadFiles()
  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-mem-cat]')
    if (tab) {
      _category = tab.dataset.memCat
      el.querySelectorAll('[data-mem-cat]').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      loadFiles()
      return
    }

    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action

    if (action === 'mem-create') showFileForm()
    else if (action === 'mem-edit') editFile(btn.dataset.id)
    else if (action === 'mem-delete') deleteFile(btn.dataset.id)
    else if (action === 'mem-export') exportZip()
    else if (action === 'mem-import') importZip()
  })
}

async function loadFiles() {
  try {
    _files = await bridge.listMemoryFiles(_category === 'all' ? null : _category) || []
  } catch {
    _files = []
  }
  renderTable()
}

function renderTable() {
  const tbody = _el.querySelector('#mem-table-body')
  if (!tbody) return

  if (!_files.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div></td></tr>`
    return
  }

  tbody.innerHTML = _files.map(f => `
    <tr>
      <td style="font-weight:500">${escHtml(f.name || f.fileName || '-')}</td>
      <td style="font-size:var(--font-size-xs);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(f.path || '-')}</td>
      <td><span class="badge badge-info">${escHtml(f.category || '-')}</span></td>
      <td style="font-size:var(--font-size-xs)">${formatTime(f.modifiedAt || f.updatedAt)}</td>
      <td style="text-align:right">
        <button class="btn btn-sm btn-ghost" data-action="mem-edit" data-id="${escAttr(f.id || f.path)}">${tl('common.edit')}</button>
        <button class="btn btn-sm btn-ghost" data-action="mem-delete" data-id="${escAttr(f.id || f.path)}" style="color:var(--error)">${tl('common.delete')}</button>
      </td>
    </tr>
  `).join('')
}

function showFileForm(file) {
  const isEdit = file != null
  const f = file || { name: '', path: '', category: 'memory', content: '' }

  showModal({
    title: isEdit ? tl('memoryFiles.editFile') : tl('memoryFiles.createFile'),
    content: `
      <div class="form-group">
        <label class="form-label">${tl('memoryFiles.fileName')}</label>
        <input class="input" id="mff-name" value="${escHtml(f.name || '')}" placeholder="user_preferences" />
      </div>
      <div class="form-group">
        <label class="form-label">${tl('memoryFiles.category')}</label>
        <select class="input" id="mff-category">
          ${CATEGORIES.filter(c => c !== 'all').map(c => `<option value="${c}" ${f.category === c ? 'selected' : ''}>${tl(`memoryFiles.${c === 'skills' ? 'skillsCat' : c}`) || c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${tl('memoryFiles.fileContent')}</label>
        <textarea class="input" id="mff-content" rows="10" style="font-family:monospace;resize:vertical">${escHtml(f.content || '')}</textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-mem-save">${tl('common.save')}</button>
    `
  })

  setTimeout(() => {
    document.getElementById('btn-mem-save')?.addEventListener('click', async () => {
      const data = {
        name: document.getElementById('mff-name')?.value?.trim(),
        category: document.getElementById('mff-category')?.value,
        content: document.getElementById('mff-content')?.value || '',
        path: isEdit ? f.path : `memory/${document.getElementById('mff-category')?.value}/${document.getElementById('mff-name')?.value?.trim()}.md`,
      }
      if (!data.name) { toast(tl('memoryFiles.fileName'), 'warn'); return }

      try {
        if (isEdit) await bridge.updateMemoryFile(data)
        else await bridge.createMemoryFile(data)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadFiles()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

function editFile(id) {
  const file = _files.find(f => (f.id || f.path) === id)
  if (file) showFileForm(file)
}

function deleteFile(id) {
  const file = _files.find(f => (f.id || f.path) === id)
  if (!file) return

  showModal({
    title: tl('memoryFiles.deleteFile'),
    content: `<p>${tl('memoryFiles.deleteConfirm')}</p><p style="font-weight:500;margin-top:8px">${escHtml(file.name || file.path)}</p>`,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-danger" id="btn-mem-del-confirm">${tl('common.delete')}</button>
    `
  })
  setTimeout(() => {
    document.getElementById('btn-mem-del-confirm')?.addEventListener('click', async () => {
      try {
        await bridge.deleteMemoryFile(id)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
        loadFiles()
      } catch (err) {
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

async function exportZip() {
  try {
    await bridge.exportMemoryFiles()
    toast(tl('common.success'), 'success')
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

async function importZip() {
  try {
    await bridge.importMemoryFiles()
    toast(tl('common.success'), 'success')
    loadFiles()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

export function cleanup() { _el = null; _files = [] }
