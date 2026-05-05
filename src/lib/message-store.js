/**
 * Agent Planet 消息存储（内存 + localStorage）
 * 分页查询、容量检查、全文搜索
 */
const STORE_KEY = 'agentplanet_messages'
const MAX_MESSAGES = 500
const LS_QUOTA_WARN = 0.8

let _messages = []
let _conversations = []

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    _messages = data.messages || []
    _conversations = data.conversations || []
  } catch { _messages = []; _conversations = [] }
}

function checkQuota() {
  try {
    const used = new Blob(Object.values(localStorage)).size
    const limit = 5 * 1024 * 1024
    return used / limit < LS_QUOTA_WARN
  } catch {
    return true
  }
}

function save() {
  try {
    if (!checkQuota()) {
      _messages = _messages.slice(-Math.floor(MAX_MESSAGES / 2))
    }
    localStorage.setItem(STORE_KEY, JSON.stringify({
      messages: _messages.slice(-MAX_MESSAGES),
      conversations: _conversations
    }))
  } catch {
    // localStorage 满时静默，内存数据仍有效
  }
}

load()

export function addMessage(conversationId, message) {
  _messages.push({
    ...message,
    conversationId,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now()
  })
  if (_messages.length > MAX_MESSAGES) _messages = _messages.slice(-MAX_MESSAGES)
  save()
}

export function getMessages(conversationId, { offset = 0, limit } = {}) {
  const filtered = _messages.filter(m => m.conversationId === conversationId)
  if (limit != null) return filtered.slice(offset, offset + limit)
  return filtered.slice(offset)
}

export function getMessageCount(conversationId) {
  return _messages.filter(m => m.conversationId === conversationId).length
}

export function searchMessages(query, conversationId) {
  const q = query.toLowerCase()
  const pool = conversationId
    ? _messages.filter(m => m.conversationId === conversationId)
    : _messages
  return pool.filter(m => {
    const text = m.content || m.text || ''
    return text.toLowerCase().includes(q)
  })
}

export function getConversations() {
  return _conversations
}

export function addConversation(conv) {
  const existing = _conversations.find(c => c.id === conv.id)
  if (existing) Object.assign(existing, conv)
  else _conversations.unshift({ ...conv, createdAt: Date.now() })
  save()
}

export function deleteConversation(id) {
  _conversations = _conversations.filter(c => c.id !== id)
  _messages = _messages.filter(m => m.conversationId !== id)
  save()
}

export function clearMessages(conversationId) {
  _messages = _messages.filter(m => m.conversationId !== conversationId)
  save()
}
