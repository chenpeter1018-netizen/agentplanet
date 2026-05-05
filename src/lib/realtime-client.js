/**
 * Agent Planet WebSocket 实时通信客户端
 * Ed25519 认证握手 + 指数退避重连（带抖动）+ 心跳检测
 */
import { bridge } from './backend-bridge.js'

const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000
const RECONNECT_MAX_ATTEMPTS = 10
const HEARTBEAT_INTERVAL = 30000
const HEARTBEAT_TIMEOUT = 10000
const CONNECT_TIMEOUT = 10000

class RealtimeHub {
  constructor() {
    this._ws = null
    this._host = ''
    this._token = ''
    this._options = {}
    this._reconnectAttempts = 0
    this._reconnectTimer = null
    this._heartbeatTimer = null
    this._heartbeatTimeoutTimer = null
    this._connectTimeoutTimer = null
    this._intentionalClose = false
    this._listeners = {}
    this.connected = false
  }

  connect(host, token, options = {}) {
    this._host = host
    this._token = token || ''
    this._options = options
    this._intentionalClose = false
    this._reconnectAttempts = 0
    this._connect()
  }

  disconnect() {
    this._intentionalClose = true
    this._clearTimers()
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
    this.connected = false
  }

  _connect() {
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${this._host}/ws`
    this._ws = new WebSocket(url)

    this._connectTimeoutTimer = setTimeout(() => {
      if (this._ws && this._ws.readyState !== WebSocket.OPEN) {
        this._ws.close()
      }
    }, CONNECT_TIMEOUT)

    this._ws.onopen = () => {
      this._clearConnectTimeout()
      this.connected = true
      this._reconnectAttempts = 0

      if (this._token) {
        this.send({ type: 'auth', token: this._token })
      }

      this._startHeartbeat()
      this._emit('connected')
      this._emit('state', true)
    }

    this._ws.onclose = (e) => {
      this._clearConnectTimeout()
      this.connected = false
      this._clearTimers()
      this._emit('state', false)
      if (!this._intentionalClose && this._reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
        this._scheduleReconnect()
      }
    }

    this._ws.onerror = (e) => {
      console.error('[realtime] WebSocket 错误:', e?.message || '连接失败')
    }

    this._ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pong') {
          this._clearHeartbeatTimeout()
          return
        }
        this._emit('message', data)
        if (data.type) this._emit(data.type, data)
      } catch {
        // 非 JSON 消息
      }
    }
  }

  _scheduleReconnect() {
    const base = Math.min(RECONNECT_BASE * Math.pow(2, this._reconnectAttempts), RECONNECT_MAX)
    const jitter = base * 0.2 * (Math.random() * 2 - 1)
    const delay = Math.round(base + jitter)
    this._reconnectAttempts++
    this._reconnectTimer = setTimeout(() => this._connect(), delay)
  }

  _startHeartbeat() {
    this._clearHeartbeatTimers()
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: 'ping' }))
        this._heartbeatTimeoutTimer = setTimeout(() => {
          this._ws?.close()
        }, HEARTBEAT_TIMEOUT)
      }
    }, HEARTBEAT_INTERVAL)
  }

  _clearHeartbeatTimeout() {
    if (this._heartbeatTimeoutTimer) {
      clearTimeout(this._heartbeatTimeoutTimer)
      this._heartbeatTimeoutTimer = null
    }
  }

  _clearConnectTimeout() {
    if (this._connectTimeoutTimer) {
      clearTimeout(this._connectTimeoutTimer)
      this._connectTimeoutTimer = null
    }
  }

  _clearHeartbeatTimers() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null }
    this._clearHeartbeatTimeout()
  }

  _clearTimers() {
    this._clearHeartbeatTimers()
    this._clearConnectTimeout()
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
  }

  send(data) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(fn)
    return () => {
      this._listeners[event] = this._listeners[event]?.filter(cb => cb !== fn)
    }
  }

  _emit(event, data) {
    this._listeners[event]?.forEach(fn => { try { fn(data) } catch {} })
  }
}

export const realtimeHub = new RealtimeHub()
