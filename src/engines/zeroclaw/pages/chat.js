/**
 * ZeroClaw 对话页面 — 卡片化消息布局
 * 每条助手消息显示：头像 + Agent名称 + 年月日 时:分 + Token + 模型
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'

let _page = null
let _messages = []
let _streaming = false
let _sessionId = null

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${mo}月${day}日 ${h}:${mi}`
}

function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

const ICONS = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M9 15c.83.67 1.83 1 3 1s2.17-.33 3-1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
}

function mdToHtml(text) {
  if (!text) return ''
  let out = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${esc(lang)}">${esc(code)}</code></pre>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
  return out
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}

// ============================================================
//  Render
// ============================================================

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page zc-chat-page'
  _page.innerHTML = `
    <div class="zc-chat-shell">
      <div class="zc-chat-main">
        <div class="zc-chat-header">
          <div class="zc-chat-header-left">
            <span class="zc-chat-logo">ZC</span>
            <div>
              <div class="zc-chat-title">ZeroClaw Chat</div>
              <div class="zc-chat-status" id="zc-chat-status">${t('engine.loading')}</div>
            </div>
          </div>
          <div class="zc-chat-header-right">
            <span class="zc-chat-model-badge" id="zc-chat-model-badge"></span>
          </div>
        </div>
        <div class="zc-chat-messages" id="zc-chat-messages">
          <div class="zc-chat-empty">
            <div class="zc-chat-empty-icon">${ICONS.bot}</div>
            <div class="zc-chat-empty-title">ZeroClaw Gateway</div>
            <div class="zc-chat-empty-sub">${t('engine.zcChatDesc')}</div>
          </div>
        </div>
        <div class="zc-chat-input-area">
          <div class="zc-chat-input-wrap">
            <textarea id="zc-chat-input" class="zc-chat-input"
              placeholder="${t('engine.chatPlaceholder')}"
              rows="2"></textarea>
            <button class="zc-chat-send-btn" id="zc-chat-send"
              title="${t('engine.chatSend')}" disabled>
              ${ICONS.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  bindEvents()
  checkStatus()
  return _page
}

// ============================================================
//  Status
// ============================================================

async function checkStatus() {
  const statusEl = _page?.querySelector('#zc-chat-status')
  const badgeEl = _page?.querySelector('#zc-chat-model-badge')
  try {
    const info = await api.checkZeroclaw()
    if (info?.running) {
      if (statusEl) statusEl.innerHTML = `<span class="zc-dot zc-dot--on"></span> Gateway v${esc(info.version || '?')}`
      if (badgeEl) badgeEl.textContent = info.version || ''
    } else {
      if (statusEl) statusEl.innerHTML = `<span class="zc-dot zc-dot--off"></span> ${t('engine.serviceStopped')} — <a href="#/z/service" style="color:var(--accent)">${t('engine.goToService')}</a>`
      if (badgeEl) badgeEl.textContent = ''
    }
  } catch {
    if (statusEl) statusEl.textContent = t('engine.loadFailed')
  }
}

// ============================================================
//  Events
// ============================================================

function bindEvents() {
  const input = _page?.querySelector('#zc-chat-input')
  const sendBtn = _page?.querySelector('#zc-chat-send')

  input?.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim() || _streaming
  })

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })

  sendBtn?.addEventListener('click', sendMessage)

  // Copy buttons (delegated)
  _page?.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.zc-msg-copy')
    if (!copyBtn) return
    const mid = copyBtn.dataset.mid
    const msg = _messages.find(m => m.id === mid)
    if (!msg?.content) return
    const ok = await copyText(msg.content)
    toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
  })
}

// ============================================================
//  Send
// ============================================================

async function sendMessage() {
  const input = _page?.querySelector('#zc-chat-input')
  const sendBtn = _page?.querySelector('#zc-chat-send')
  const text = input?.value?.trim()
  if (!text || _streaming) return

  input.value = ''
  sendBtn.disabled = true
  _streaming = true

  appendMessage({ role: 'user', content: text, timestamp: Date.now() })
  const assistId = appendMessage({ role: 'assistant', content: '', timestamp: Date.now(), streaming: true })
  scrollBottom()

  try {
    const resp = await api.zeroclawApiProxy('POST', '/v1/chat', {
      messages: [{ role: 'user', content: text }],
      session_id: _sessionId,
      stream: false,
    })
    if (resp?.body?.session_id) _sessionId = resp.body.session_id

    const body = resp?.body || {}
    const reply = body.content || body.message || body.reply || JSON.stringify(body)
    const meta = {
      agentName: body.agent_name || body.agentName || body.agent || 'ZeroClaw',
      model: body.model || '',
      inputTokens: body.input_tokens || body.usage?.input_tokens || 0,
      outputTokens: body.output_tokens || body.usage?.output_tokens || 0,
      timestamp: Date.now(),
    }
    updateMessage(assistId, reply, meta)
  } catch (e) {
    updateMessage(assistId, '⚠️ ' + esc(e?.message || String(e)), { agentName: 'Error', timestamp: Date.now() })
  }

  _streaming = false
  sendBtn.disabled = false
  input.focus()
  scrollBottom()
}

// ============================================================
//  Messages
// ============================================================

function appendMessage(msg) {
  const id = uid()
  _messages.push({ id, ...msg })
  const msgsEl = _page?.querySelector('#zc-chat-messages')
  const emptyEl = msgsEl?.querySelector('.zc-chat-empty')
  if (emptyEl) emptyEl.remove()
  renderMessages()
  return id
}

function updateMessage(id, content, meta = {}) {
  const idx = _messages.findIndex(m => m.id === id)
  if (idx === -1) return
  _messages[idx] = { ..._messages[idx], content, ...meta, streaming: false }
  renderMessages()
  scrollBottom()
}

function renderMessages() {
  const msgsEl = _page?.querySelector('#zc-chat-messages')
  if (!msgsEl) return

  // Remove existing message elements (keep empty state if any)
  msgsEl.querySelectorAll('.zc-chat-msg').forEach(el => el.remove())

  _messages.forEach(m => {
    const el = renderMessage(m)
    msgsEl.appendChild(el)
  })
}

function renderMessage(m) {
  const el = document.createElement('div')
  el.className = `zc-chat-msg zc-chat-msg--${m.role}`

  if (m.role === 'user') {
    el.innerHTML = `
      <div class="zc-msg-body">
        <div class="zc-msg-bubble zc-msg-bubble--user">
          <div class="zc-msg-content">${mdToHtml(m.content)}</div>
        </div>
        <div class="zc-msg-meta zc-msg-meta--user">
          <span class="zc-msg-time">${formatTime(m.timestamp)}</span>
        </div>
      </div>
      <div class="zc-msg-avatar zc-msg-avatar--user">${ICONS.user}</div>
    `
  } else {
    const isStreaming = m.streaming && !m.content
    const agentName = m.agentName || 'ZeroClaw'
    const model = m.model || ''
    const tokens = []
    if (m.inputTokens > 0) tokens.push(`↑${formatTokens(m.inputTokens)}`)
    if (m.outputTokens > 0) tokens.push(`↓${formatTokens(m.outputTokens)}`)
    const tokenStr = tokens.join(' ')

    el.innerHTML = `
      <div class="zc-msg-avatar zc-msg-avatar--assistant">${ICONS.bot}</div>
      <div class="zc-msg-body">
        <div class="zc-msg-sender">
          <span class="zc-msg-agent-name">${esc(agentName)}</span>
          ${model ? `<span class="zc-msg-model">${esc(model)}</span>` : ''}
        </div>
        <div class="zc-msg-bubble zc-msg-bubble--assistant">
          ${isStreaming
            ? '<span class="zc-streaming-dots"><span>.</span><span>.</span><span>.</span></span>'
            : `<div class="zc-msg-content">${mdToHtml(m.content)}</div>`}
        </div>
        <div class="zc-msg-meta zc-msg-meta--assistant">
          <span class="zc-msg-time">${formatTime(m.timestamp)}</span>
          ${tokenStr ? `<span class="zc-msg-tokens">${tokenStr}</span>` : ''}
          <button class="zc-msg-copy" data-mid="${esc(m.id)}" title="${t('engine.chatCopyMessageShort')}">
            ${ICONS.copy}
          </button>
        </div>
      </div>
    `
  }

  return el
}

function scrollBottom() {
  const el = _page?.querySelector('#zc-chat-messages')
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight }, 50)
}
