/**
 * ZeroClaw 对话页面 — 连接 ZeroClaw Gateway 实时聊天
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

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page'
  _page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.aiChat')}</h1>
      <p class="page-desc" id="zc-chat-status">${t('engine.loading')}</p>
    </div>
    <div id="zc-chat-body">
      <div id="zc-chat-messages" style="flex:1;overflow-y:auto;padding:16px;min-height:300px;max-height:calc(100vh - 300px)">
        <div class="form-hint" style="text-align:center;margin-top:60px">ZeroClaw Gateway</div>
      </div>
      <div style="display:flex;gap:8px;padding:8px 16px 16px;border-top:1px solid var(--border-color)">
        <textarea id="zc-chat-input" class="chat-input" rows="2"
          placeholder="${t('engine.chatPlaceholder')}"
          style="flex:1;resize:none;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary);font-size:14px;font-family:inherit"
        ></textarea>
        <button class="btn btn-primary" id="zc-chat-send" style="align-self:flex-end;height:40px">
          ${t('engine.chatSend')}
        </button>
      </div>
    </div>
  `
  bindEvents()
  checkStatus()
  return _page
}

function bindEvents() {
  _page.querySelector('#zc-chat-send')?.addEventListener('click', sendMessage)
  _page.querySelector('#zc-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
}

async function checkStatus() {
  const statusEl = _page?.querySelector('#zc-chat-status')
  try {
    const info = await api.checkZeroclaw()
    if (info?.running) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#22c55e">●</span> ZeroClaw v${esc(info.version || '?')} — ${t('engine.gatewayRunning')}`
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:#9ca3af">●</span> ${t('engine.serviceStopped')} — <a href="#/z/service">${t('engine.goToService')}</a>`
    }
  } catch {
    if (statusEl) statusEl.textContent = t('engine.loadFailed')
  }
}

async function sendMessage() {
  const input = _page?.querySelector('#zc-chat-input')
  const btn = _page?.querySelector('#zc-chat-send')
  const text = input?.value?.trim()
  if (!text || _streaming) return

  input.value = ''
  btn.disabled = true
  _streaming = true

  const msgEl = _page?.querySelector('#zc-chat-messages')
  appendMessage('user', text)
  const assistId = appendMessage('assistant', '')

  try {
    const resp = await api.zeroclawApiProxy('POST', '/v1/chat', {
      messages: [{ role: 'user', content: text }],
      session_id: _sessionId,
      stream: false,
    })
    if (resp?.body?.session_id) _sessionId = resp.body.session_id
    const reply = resp?.body?.content || resp?.body?.message || resp?.body?.reply || JSON.stringify(resp?.body)
    updateMessage(assistId, reply)
  } catch (e) {
    updateMessage(assistId, '⚠️ ' + (e?.message || e))
  }

  _streaming = false
  btn.disabled = false
  input.focus()
  scrollBottom()
}

function appendMessage(role, content) {
  const id = uid()
  _messages.push({ id, role, content })
  const msgsEl = _page?.querySelector('#zc-chat-messages')
  const emptyHint = msgsEl?.querySelector('.form-hint')
  if (emptyHint) emptyHint.remove()

  const el = document.createElement('div')
  el.id = `msg-${id}`
  el.style.cssText = `margin-bottom:12px;padding:8px 12px;border-radius:8px;max-width:85%;${role === 'user' ? 'margin-left:auto;background:var(--accent-color);color:#fff' : 'background:var(--bg-secondary);color:var(--text-primary)'}`
  el.innerHTML = role === 'assistant' ? '<span style="opacity:0.5">...</span>' : esc(content)
  msgsEl?.appendChild(el)
  return id
}

function updateMessage(id, content) {
  const el = _page?.querySelector(`#msg-${id}`)
  if (el) el.innerHTML = esc(content).replace(/\n/g, '<br>')
  const msg = _messages.find(m => m.id === id)
  if (msg) msg.content = content
  scrollBottom()
}

function scrollBottom() {
  const el = _page?.querySelector('#zc-chat-messages')
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight }, 50)
}
