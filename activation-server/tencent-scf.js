/**
 * Agent-Planet 腾讯云函数
 * 路由：
 *   POST /api/activation       激活码校验（原有逻辑）
 *   POST /api/device/check      设备数量校验（妙搭后端调用，HMAC 签名）
 *   POST /api/device/register   设备注册（Tauri 应用调用，JWT token）
 *   POST /api/device/list       设备列表（Tauri 应用调用，JWT token）
 *   POST /api/device/unbind     设备解绑（Tauri 应用调用，JWT token）
 */
const crypto = require('crypto')

// ═══════════════════════════════════════
// 配置
// ═══════════════════════════════════════
const DEVICE_API_SECRET = process.env.DEVICE_API_SECRET || ''
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '' // 妙搭 JWT 公钥（PEM），用于验证 Tauri 调用
const MAX_DEVICES = 6

// ═══════════════════════════════════════
// 设备存储（生产环境替换为 Redis）
// ═══════════════════════════════════════
// TODO: 替换为 Redis
// const Redis = require('ioredis')
// const redis = new Redis(process.env.REDIS_URL)
const deviceStore = new Map() // userId → { hwfps: Set, devices: [{fingerprint, deviceName, registeredAt}] }

// ═══════════════════════════════════════
// 激活码存储（保持兼容）
// ═══════════════════════════════════════
const ACTIVATIONS = {}

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

function r(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  }
}

function hmacSign(payload) {
  return crypto.createHmac('sha256', DEVICE_API_SECRET).update(payload).digest('hex')
}

function verifyHmac(userId, hwfp, sign) {
  return hmacSign(`${userId}:${hwfp}`) === sign
}

/** 验证 JWT token，返回 { valid, userId } */
function verifyJwt(token) {
  if (!JWT_PUBLIC_KEY) {
    // 无公钥时跳过 JWT 验证（仅开发环境）
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return { valid: false }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      return { valid: true, userId: payload.userId || payload.sub }
    } catch (_) {
      return { valid: false }
    }
  }
  try {
    const crypto = require('crypto')
    const [headerB64, payloadB64, sigB64] = token.split('.')
    const signed = `${headerB64}.${payloadB64}`
    const sig = Buffer.from(sigB64, 'base64')
    const valid = crypto.verify('sha256', Buffer.from(signed), JWT_PUBLIC_KEY, sig)
    if (!valid) return { valid: false }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString())
    return { valid: true, userId: payload.userId || payload.sub }
  } catch (_) {
    return { valid: false }
  }
}

// ═══════════════════════════════════════
// 设备存储操作
// ═══════════════════════════════════════

function getUserDevices(userId) {
  if (!deviceStore.has(userId)) {
    deviceStore.set(userId, { hwfps: new Set(), devices: [] })
  }
  return deviceStore.get(userId)
}

function registerDeviceInStore(userId, hwfp, deviceName) {
  const entry = getUserDevices(userId)

  // 已存在：更新设备名，不新增计数
  const existing = entry.devices.find(d => d.fingerprint === hwfp)
  if (existing) {
    existing.deviceName = deviceName
    existing.registeredAt = Date.now()
    return { isNew: false, count: entry.devices.length }
  }

  // 新增设备
  if (entry.devices.length >= MAX_DEVICES) {
    return { isNew: false, count: entry.devices.length, blocked: true }
  }

  entry.hwfps.add(hwfp)
  entry.devices.push({
    fingerprint: hwfp,
    deviceName,
    registeredAt: Date.now(),
  })
  return { isNew: true, count: entry.devices.length }
}

function unbindDeviceInStore(userId, hwfp) {
  const entry = deviceStore.get(userId)
  if (!entry) return { count: 0 }
  entry.hwfps.delete(hwfp)
  entry.devices = entry.devices.filter(d => d.fingerprint !== hwfp)
  return { count: entry.devices.length }
}

// ═══════════════════════════════════════
// 路由：激活码
// ═══════════════════════════════════════

function handleActivation(body) {
  const { key_id, fingerprint, action, max_machines, expires_at } = body

  if (!key_id) return r(400, { error: 'missing key_id' })

  if (action === 'register') {
    if (ACTIVATIONS[key_id]) {
      return r(200, { success: true, message: 'already exists', key_id, max_machines: ACTIVATIONS[key_id].max_machines })
    }
    ACTIVATIONS[key_id] = {
      activations: [],
      at: Date.now(),
      max_machines: max_machines || 3,
      expires_at: expires_at || 0,
    }
    return r(200, { success: true, message: 'registered', key_id, max_machines: ACTIVATIONS[key_id].max_machines })
  }

  if (!fingerprint) return r(400, { error: 'missing fingerprint' })

  if (!ACTIVATIONS[key_id]) {
    ACTIVATIONS[key_id] = {
      activations: [],
      at: Date.now(),
      max_machines: max_machines || 3,
      expires_at: expires_at || 0,
    }
  }

  const entry = ACTIVATIONS[key_id]
  entry.last = Date.now()

  if (max_machines && entry.max_machines === 3 && !entry._registered) {
    entry.max_machines = max_machines
  }

  const max = entry.max_machines
  if (entry.activations.length >= max && !entry.activations.includes(fingerprint)) {
    return r(403, { error: `max activations reached (${max})`, current: entry.activations.length, max })
  }

  if (!entry.activations.includes(fingerprint)) {
    entry.activations.push(fingerprint)
  }

  const token = Buffer.from(JSON.stringify({ kid: key_id, fp: fingerprint, ts: Date.now() })).toString('base64')
  return r(200, { success: true, token, activations: entry.activations.length, max })
}

// ═══════════════════════════════════════
// 路由：设备管理
// ═══════════════════════════════════════

/**
 * POST /api/device/check
 * 妙搭后端调用，HMAC 签名认证
 * Body: { userId, hwfp, sign }
 * sign = HMAC-SHA256(userId:hwfp, DEVICE_API_SECRET)
 */
function handleDeviceCheck(body) {
  const { userId, hwfp, sign } = body

  if (!userId || !hwfp || !sign) {
    return r(400, { ok: false, message: '缺少必要参数' })
  }

  if (!verifyHmac(userId, hwfp, sign)) {
    return r(401, { ok: false, message: '签名验证失败' })
  }

  const result = registerDeviceInStore(userId, hwfp, `设备-${hwfp.substring(0, 8)}`)

  if (result.blocked) {
    return r(200, {
      ok: true,
      allowed: false,
      deviceCount: result.count,
      maxDevices: MAX_DEVICES,
      message: `设备数量已达上限(${MAX_DEVICES}台)，请先解绑旧设备`,
    })
  }

  return r(200, {
    ok: true,
    allowed: true,
    deviceCount: result.count,
    maxDevices: MAX_DEVICES,
  })
}

/**
 * POST /api/device/register
 * Tauri 应用调用，JWT token 认证
 * Body: { userId, token, hardwareFingerprint, deviceName }
 */
function handleDeviceRegister(body) {
  const { userId, token, hardwareFingerprint, deviceName } = body

  if (!userId || !token || !hardwareFingerprint) {
    return r(400, { ok: false, message: '缺少必要参数' })
  }

  const jwt = verifyJwt(token)
  if (!jwt.valid) {
    return r(401, { ok: false, message: 'Token 验证失败' })
  }
  if (jwt.userId !== userId) {
    return r(403, { ok: false, message: 'Token 与用户不匹配' })
  }

  const result = registerDeviceInStore(userId, hardwareFingerprint, deviceName || `设备-${hardwareFingerprint.substring(0, 8)}`)

  if (result.blocked) {
    return r(200, {
      ok: true,
      deviceCount: result.count,
      maxDevices: MAX_DEVICES,
      message: `设备数量已达上限(${MAX_DEVICES}台)，请先解绑旧设备`,
    })
  }

  return r(200, {
    ok: true,
    deviceCount: result.count,
    maxDevices: MAX_DEVICES,
    message: result.isNew ? '设备注册成功' : '设备已存在，已更新',
  })
}

/**
 * POST /api/device/list
 * Tauri 应用调用，JWT token 认证
 * Body: { userId, token }
 */
function handleDeviceList(body) {
  const { userId, token } = body

  if (!userId || !token) {
    return r(400, { ok: false, message: '缺少必要参数' })
  }

  const jwt = verifyJwt(token)
  if (!jwt.valid) {
    return r(401, { ok: false, message: 'Token 验证失败' })
  }

  const entry = deviceStore.get(userId)
  const devices = entry ? entry.devices : []

  return r(200, {
    ok: true,
    deviceCount: devices.length,
    maxDevices: MAX_DEVICES,
    devices,
  })
}

/**
 * POST /api/device/unbind
 * Tauri 应用调用，JWT token 认证
 * Body: { userId, token, fingerprint }
 */
function handleDeviceUnbind(body) {
  const { userId, token, fingerprint } = body

  if (!userId || !token || !fingerprint) {
    return r(400, { ok: false, message: '缺少必要参数' })
  }

  const jwt = verifyJwt(token)
  if (!jwt.valid) {
    return r(401, { ok: false, message: 'Token 验证失败' })
  }
  if (jwt.userId !== userId) {
    return r(403, { ok: false, message: 'Token 与用户不匹配' })
  }

  const result = unbindDeviceInStore(userId, fingerprint)

  return r(200, {
    ok: true,
    deviceCount: result.count,
    maxDevices: MAX_DEVICES,
    message: '设备已解绑',
  })
}

// ═══════════════════════════════════════
// 主入口
// ═══════════════════════════════════════

exports.main_handler = async (event) => {
  const method = event.httpMethod || 'GET'
  const path = event.path || '/'

  if (method === 'OPTIONS') {
    return r(200, {})
  }

  // 健康检查
  if (method === 'GET' && path === '/') {
    return r(200, { status: 'ok', service: 'agent-planet' })
  }

  if (method !== 'POST') {
    return r(405, { error: 'Method not allowed' })
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event)

    // 路由分发
    if (path === '/api/device/check') {
      return handleDeviceCheck(body)
    }
    if (path === '/api/device/register') {
      return handleDeviceRegister(body)
    }
    if (path === '/api/device/list') {
      return handleDeviceList(body)
    }
    if (path === '/api/device/unbind') {
      return handleDeviceUnbind(body)
    }

    // 默认：激活码逻辑（兼容原有 /api/activation 或无路径的调用）
    return handleActivation(body)
  } catch (e) {
    return r(500, { ok: false, message: e.message || String(e) })
  }
}
