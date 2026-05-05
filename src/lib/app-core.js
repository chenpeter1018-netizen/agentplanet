/**
 * Agent Planet 全局应用状态
 * 管理引擎状态检测、Gateway 轮询、WebSocket 连接状态
 */
import { bridge } from './backend-bridge.js'

let _gatewayRunning = false
let _gatewayForeign = false
let _openclawReady = false
let _openclawUpgrading = false
let _activeInstance = null

const _gatewayListeners = []
const _instanceListeners = []
const _guardianGiveUpListeners = []
let _gatewayPollTimer = null

export async function detectEngineStatus() {
  try {
    const status = await bridge.checkInstallation()
    _openclawReady = status?.ready || false
    _openclawUpgrading = status?.upgrading || false
  } catch {
    _openclawReady = false
  }
}

export async function refreshGatewayStatus() {
  try {
    const svc = await bridge.getServicesStatus()
    const gw = svc?.find?.(s => s.label === 'ai.openclaw.gateway') || svc?.[0] || null
    const wasRunning = _gatewayRunning
    const wasForeign = _gatewayForeign
    _gatewayRunning = gw?.running === true
    _gatewayForeign = gw?.foreign === true
    if (_gatewayRunning !== wasRunning) {
      _gatewayListeners.forEach(fn => { try { fn(_gatewayRunning) } catch {} })
    }
    if (_gatewayForeign !== wasForeign) {
      _guardianGiveUpListeners.forEach(fn => { try { fn({ foreign: _gatewayForeign }) } catch {} })
    }
  } catch {}
}

export function isEngineReady() { return _openclawReady }
export function isUpgrading() { return _openclawUpgrading }
export function isGatewayRunning() { return _gatewayRunning }
export function isGatewayForeign() { return _gatewayForeign }

export function onGatewayChange(fn) {
  _gatewayListeners.push(fn)
  return () => { const i = _gatewayListeners.indexOf(fn); if (i >= 0) _gatewayListeners.splice(i, 1) }
}

export function onGuardianGiveUp(fn) {
  _guardianGiveUpListeners.push(fn)
  return () => { const i = _guardianGiveUpListeners.indexOf(fn); if (i >= 0) _guardianGiveUpListeners.splice(i, 1) }
}

export function onInstanceChange(fn) {
  _instanceListeners.push(fn)
  return () => { const i = _instanceListeners.indexOf(fn); if (i >= 0) _instanceListeners.splice(i, 1) }
}

export function getActiveInstance() {
  return _activeInstance || { name: 'default', type: 'local' }
}

export async function loadActiveInstance() {
  try {
    const list = await bridge.instanceList()
    const active = list?.find?.(i => i.active) || list?.[0]
    if (active) _activeInstance = active
  } catch {}
}

export function resetAutoRestart() {
  bridge.guardianStatus().catch(() => {})
}

export function startGatewayPoll() {
  if (_gatewayPollTimer) return
  refreshGatewayStatus()
  _gatewayPollTimer = setInterval(refreshGatewayStatus, 10000)
}

export function stopGatewayPoll() {
  if (_gatewayPollTimer) {
    clearInterval(_gatewayPollTimer)
    _gatewayPollTimer = null
  }
}
