/**
 * 小笔记 — 浮动按钮 + 轻量笔记面板
 * 替换全局 AI 助手浮动按钮，用于临时记录想法
 * 数据存储在 localStorage
 */

import { t } from '../lib/i18n.js'

const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
const PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'

const POS_KEY = 'agent-planet-notes-pos'
const NOTES_KEY = 'agent-planet-quick-notes'

let _fab = null
let _panel = null

export function initNotesFab() {
  if (_fab) return _fab
  _fab = createFab()
  return _fab
}

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]')
  } catch { return [] }
}

function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
}

function createFab() {
  const fab = document.createElement('button')
  fab.className = 'notes-fab'
  fab.title = t('notes.quickNote', 'Quick Note')
  fab.innerHTML = NOTE_ICON
  document.body.appendChild(fab)

  restorePosition(fab)

  let _dragging = false
  let _dragMoved = false
  let _startX = 0, _startY = 0
  let _fabX = 0, _fabY = 0

  function onPointerDown(e) {
    if (e.button !== 0) return
    _dragging = true
    _dragMoved = false
    _startX = e.clientX
    _startY = e.clientY
    const rect = fab.getBoundingClientRect()
    _fabX = rect.left
    _fabY = rect.top
    fab.style.transition = 'none'
    fab.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e) {
    if (!_dragging) return
    const dx = e.clientX - _startX
    const dy = e.clientY - _startY
    if (!_dragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    _dragMoved = true
    fab.classList.add('dragging')

    const vw = window.innerWidth
    const vh = window.innerHeight
    const size = 48
    let newX = Math.max(8, Math.min(vw - size - 8, _fabX + dx))
    let newY = Math.max(8, Math.min(vh - size - 8, _fabY + dy))

    fab.style.left = newX + 'px'
    fab.style.top = newY + 'px'
    fab.style.right = 'auto'
    fab.style.bottom = 'auto'
  }

  function onPointerUp(e) {
    if (!_dragging) return
    _dragging = false
    fab.classList.remove('dragging')
    fab.style.transition = ''

    if (_dragMoved) {
      const rect = fab.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const snapRight = rect.left > vw / 2
      const y = Math.max(8, Math.min(vh - 56, rect.top))

      if (snapRight) {
        fab.style.left = 'auto'
        fab.style.right = '24px'
      } else {
        fab.style.left = '24px'
        fab.style.right = 'auto'
      }
      fab.style.top = y + 'px'
      fab.style.bottom = 'auto'

      savePosition(snapRight ? 'right' : 'left', y)
    } else {
      togglePanel()
    }
  }

  fab.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)

  return { el: fab }
}

function togglePanel() {
  if (_panel) {
    closePanel()
    return
  }
  openPanel()
}

function openPanel() {
  if (_panel) return

  _panel = document.createElement('div')
  _panel.className = 'notes-panel'
  _panel.innerHTML = `
    <div class="notes-panel-header">
      <span class="notes-panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> ${t('notes.quickNotes', 'Quick Notes')}</span>
      <button class="notes-btn-close" title="${t('common.close', 'Close')}">${CLOSE_ICON}</button>
    </div>
    <div class="notes-input-area">
      <textarea class="notes-input" placeholder="${t('notes.enterNote', '输入笔记内容...')}" rows="3"></textarea>
      <button class="notes-save-btn">${t('common.save', 'Save')}</button>
    </div>
    <div class="notes-list"></div>
  `

  document.body.appendChild(_panel)
  renderNoteList()
  bindPanelEvents()

  // 定位面板在按钮上方
  positionPanel()
}

function closePanel() {
  if (_panel) {
    _panel.remove()
    _panel = null
  }
}

function positionPanel() {
  if (!_panel || !_fab?.el) return
  const fabRect = _fab.el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pw = 340
  const ph = 420
  const gap = 12

  let left = fabRect.right - pw
  if (left < 12) left = 12
  if (left + pw > vw - 12) left = vw - pw - 12
  if (left < 12) left = 12

  let top = fabRect.top - ph - gap
  if (top < 12) top = fabRect.bottom + gap

  _panel.style.left = left + 'px'
  _panel.style.top = top + 'px'
}

function renderNoteList() {
  if (!_panel) return
  const listEl = _panel.querySelector('.notes-list')
  if (!listEl) return

  const notes = loadNotes()

  if (notes.length === 0) {
    listEl.innerHTML = `<div class="notes-empty">${t('notes.empty', 'No notes yet. Tap + to create one.')}</div>`
    return
  }

  listEl.innerHTML = notes.map((note, i) => `
    <div class="notes-item" data-index="${i}">
      <div class="notes-item-content">${escapeHtml(note.text.slice(0, 120))}${note.text.length > 120 ? '...' : ''}</div>
      <div class="notes-item-meta">
        <span class="notes-item-time">${formatTime(note.ts)}</span>
        <button class="notes-item-delete" data-index="${i}" title="${t('common.delete', 'Delete')}">${TRASH_ICON}</button>
      </div>
    </div>
  `).join('')

  // 绑定条目点击（编辑）
  listEl.querySelectorAll('.notes-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.notes-item-delete')) return
      const i = parseInt(item.dataset.index)
      editNote(i)
    })
  })

  // 绑定删除按钮
  listEl.querySelectorAll('.notes-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const i = parseInt(btn.dataset.index)
      deleteNote(i)
    })
  })
}

function bindPanelEvents() {
  if (!_panel) return

  _panel.querySelector('.notes-btn-close').addEventListener('click', closePanel)

  // 保存按钮
  _panel.querySelector('.notes-save-btn').addEventListener('click', () => {
    const textarea = _panel.querySelector('.notes-input')
    if (textarea && textarea.value.trim()) {
      const notes = loadNotes()
      notes.unshift({ text: textarea.value.trim(), ts: Date.now() })
      saveNotes(notes)
      textarea.value = ''
      renderNoteList()
    }
  })

  // Ctrl+Enter / Cmd+Enter 快捷保存
  _panel.querySelector('.notes-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      _panel.querySelector('.notes-save-btn').click()
    }
  })

  // 点击面板外关闭
  setTimeout(() => {
    document.addEventListener('click', onClickOutside, { once: true })
  }, 100)
}

function onClickOutside(e) {
  if (_panel && !_panel.contains(e.target) && !_fab?.el?.contains(e.target)) {
    closePanel()
  }
  // 持续监听
  if (_panel) {
    setTimeout(() => {
      document.addEventListener('click', onClickOutside, { once: true })
    }, 100)
  }
}

function createNewNote() {
  const notes = loadNotes()
  const text = prompt(t('notes.enterNote', 'Enter your note:'), '')
  if (text && text.trim()) {
    notes.unshift({ text: text.trim(), ts: Date.now() })
    saveNotes(notes)
    renderNoteList()
  }
}

function editNote(index) {
  const notes = loadNotes()
  if (!notes[index]) return

  // 用简单的 modal 编辑
  const modal = document.createElement('div')
  modal.className = 'notes-edit-modal'
  modal.innerHTML = `
    <div class="notes-edit-backdrop"></div>
    <div class="notes-edit-card">
      <textarea class="notes-edit-textarea" rows="6">${escapeHtml(notes[index].text)}</textarea>
      <div class="notes-edit-actions">
        <button class="notes-edit-cancel">${t('common.cancel', 'Cancel')}</button>
        <button class="notes-edit-save">${t('common.save', 'Save')}</button>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  const textarea = modal.querySelector('.notes-edit-textarea')
  textarea.focus()
  textarea.setSelectionRange(textarea.value.length, textarea.value.length)

  modal.querySelector('.notes-edit-backdrop').addEventListener('click', () => modal.remove())
  modal.querySelector('.notes-edit-cancel').addEventListener('click', () => modal.remove())
  modal.querySelector('.notes-edit-save').addEventListener('click', () => {
    const newText = textarea.value.trim()
    if (newText) {
      notes[index].text = newText
      notes[index].ts = Date.now()
      saveNotes(notes)
      renderNoteList()
    }
    modal.remove()
  })

  // ESC 关闭
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modal.remove()
  })
}

function deleteNote(index) {
  const notes = loadNotes()
  notes.splice(index, 1)
  saveNotes(notes)
  renderNoteList()
}

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (isToday) return `${hh}:${mm}`
  const M = d.getMonth() + 1
  const D = d.getDate()
  return `${M}/${D} ${hh}:${mm}`
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ── 位置持久化 ──

function savePosition(side, top) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ side, top })) } catch {}
}

function restorePosition(fab) {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY))
    if (saved) {
      fab.style.top = saved.top + 'px'
      fab.style.bottom = 'auto'
      if (saved.side === 'left') {
        fab.style.left = '24px'
        fab.style.right = 'auto'
      } else {
        fab.style.left = 'auto'
        fab.style.right = '24px'
      }
    }
  } catch {}
}
