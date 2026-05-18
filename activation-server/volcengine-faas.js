/**
 * Agent-Planet 火山引擎 veFaaS Web 函数
 *
 * 部署说明：
 *   1. 创建「Web 应用函数」
 *   2. 运行时选 Node.js 18/20
 *   3. 监听端口：8000（默认）
 *   4. 环境变量：
 *      - DEVICE_API_SECRET  与妙搭一致
 *      - JWT_PUBLIC_KEY     妙搭 JWT 公钥（PEM），可选
 *      - MIAODA_API_BASE    妙搭 OpenAPI 地址
 *      - MIAODA_API_KEY     妙搭 OpenAPI Bearer Token
 *   5. 内存 256MB+，超时 30s+
 *
 * 路由：
 *   POST /api/activation          激活码校验
 *   POST /api/device/check         设备数量校验（妙搭后端调用，HMAC 签名）
 *   POST /api/device/register      设备注册（Tauri 应用调用，JWT token）
 *   POST /api/device/list          设备列表（Tauri 应用调用，JWT token）
 *   POST /api/device/unbind        设备解绑（Tauri 应用调用，JWT token）
 *   POST /api/auth/send-sms-code   发送短信验证码（代理到妙搭 OpenAPI）
 *   POST /api/auth/sms-login       短信验证码登录（代理到妙搭 OpenAPI）
 *   POST /api/auth/complete-info   完善用户信息（代理到妙搭 OpenAPI）
 *   POST /api/auth/password-login  密码登录（代理到妙搭 OpenAPI）
 *   GET  /                         健康检查
 */
const http = require('http')
const https = require('https')
const crypto = require('crypto')

// ═══════════════════════════════════════
// 配置
// ═══════════════════════════════════════
const PORT = parseInt(process.env.PORT || '8000', 10)
const DEVICE_API_SECRET = process.env.DEVICE_API_SECRET || ''
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || ''
const MIAODA_API_BASE = process.env.MIAODA_API_BASE || 'https://m2gtpsn7tp.aiforce.cloud/app/app_4k541hw8u493p'
const MIAODA_API_KEY = process.env.MIAODA_API_KEY || ''
const MAX_DEVICES = 6

// ═══════════════════════════════════════
// 存储（生产环境替换为 Redis）
// ═══════════════════════════════════════
const deviceStore = new Map()
const ACTIVATIONS = {}

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

function log(msg, data) {
  console.log(`[${new Date().toISOString()}] ${msg}`, data ? JSON.stringify(data) : '')
}

function hmacSign(payload) {
  return crypto.createHmac('sha256', DEVICE_API_SECRET).update(payload).digest('hex')
}

function verifyHmac(userId, hwfp, sign) {
  const expected = hmacSign(`${userId}:${hwfp}`)
  const ok = expected === sign
  if (!ok) {
    log('HMAC 验证失败', { userId, hwfp, expected: expected.substring(0, 16) + '...', got: (sign || '').substring(0, 16) + '...' })
  }
  return ok
}

function verifyJwt(token) {
  if (!JWT_PUBLIC_KEY) {
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

function checkDeviceLimit(userId, hwfp) {
  const entry = getUserDevices(userId)
  const existing = entry.devices.find(d => d.fingerprint === hwfp)
  return {
    exists: !!existing,
    count: entry.devices.length,
    blocked: !existing && entry.devices.length >= MAX_DEVICES,
  }
}

function registerDeviceInStore(userId, hwfp, deviceName) {
  const entry = getUserDevices(userId)

  const existing = entry.devices.find(d => d.fingerprint === hwfp)
  if (existing) {
    existing.deviceName = deviceName
    existing.registeredAt = Date.now()
    log('设备已存在，更新', { userId, hwfp, count: entry.devices.length })
    return { isNew: false, count: entry.devices.length }
  }

  if (entry.devices.length >= MAX_DEVICES) {
    log('设备数量超限', { userId, hwfp, count: entry.devices.length, max: MAX_DEVICES })
    return { isNew: false, count: entry.devices.length, blocked: true }
  }

  entry.hwfps.add(hwfp)
  entry.devices.push({ fingerprint: hwfp, deviceName, registeredAt: Date.now() })
  log('设备注册成功', { userId, hwfp, count: entry.devices.length })
  return { isNew: true, count: entry.devices.length }
}

function unbindDeviceInStore(userId, hwfp) {
  const entry = deviceStore.get(userId)
  if (!entry) return { count: 0 }
  entry.hwfps.delete(hwfp)
  entry.devices = entry.devices.filter(d => d.fingerprint !== hwfp)
  log('设备已解绑', { userId, hwfp, count: entry.devices.length })
  return { count: entry.devices.length }
}

// ═══════════════════════════════════════
// 路由处理
// ═══════════════════════════════════════

function handleActivation(body) {
  const { key_id, fingerprint, action, max_machines, expires_at } = body
  if (!key_id) return [400, { error: 'missing key_id' }]

  if (action === 'register') {
    if (ACTIVATIONS[key_id]) {
      return [200, { success: true, message: 'already exists', key_id, max_machines: ACTIVATIONS[key_id].max_machines }]
    }
    ACTIVATIONS[key_id] = { activations: [], at: Date.now(), max_machines: max_machines || 3, expires_at: expires_at || 0 }
    return [200, { success: true, message: 'registered', key_id, max_machines: ACTIVATIONS[key_id].max_machines }]
  }

  if (!fingerprint) return [400, { error: 'missing fingerprint' }]

  if (!ACTIVATIONS[key_id]) {
    ACTIVATIONS[key_id] = { activations: [], at: Date.now(), max_machines: max_machines || 3, expires_at: expires_at || 0 }
  }

  const entry = ACTIVATIONS[key_id]
  entry.last = Date.now()
  if (max_machines && entry.max_machines === 3 && !entry._registered) entry.max_machines = max_machines

  const max = entry.max_machines
  if (entry.activations.length >= max && !entry.activations.includes(fingerprint)) {
    return [403, { error: `max activations reached (${max})`, current: entry.activations.length, max }]
  }

  if (!entry.activations.includes(fingerprint)) entry.activations.push(fingerprint)

  const token = Buffer.from(JSON.stringify({ kid: key_id, fp: fingerprint, ts: Date.now() })).toString('base64')
  return [200, { success: true, token, activations: entry.activations.length, max }]
}

function handleDeviceCheck(body) {
  const { userId, hwfp, sign } = body
  if (!userId || !hwfp || !sign) {
    log('device/check 缺少参数', body)
    return [400, { ok: false, message: '缺少必要参数(userId, hwfp, sign)' }]
  }
  if (!verifyHmac(userId, hwfp, sign)) {
    return [401, { ok: false, message: '签名验证失败' }]
  }
  const result = checkDeviceLimit(userId, hwfp)
  if (result.blocked) {
    return [200, { ok: true, allowed: false, deviceCount: result.count, maxDevices: MAX_DEVICES, message: `设备数量已达上限(${MAX_DEVICES}台)，请先解绑旧设备` }]
  }
  return [200, { ok: true, allowed: true, deviceCount: result.count, maxDevices: MAX_DEVICES }]
}

function handleDeviceRegister(body) {
  const { userId, token, hardwareFingerprint, deviceName } = body
  log('device/register 请求', { userId, hwfp: hardwareFingerprint ? hardwareFingerprint.substring(0, 8) + '...' : 'MISSING', deviceName })

  if (!userId || !token || !hardwareFingerprint) {
    log('device/register 缺少参数', { hasUserId: !!userId, hasToken: !!token, hasHwfp: !!hardwareFingerprint })
    return [400, { ok: false, message: '缺少必要参数(userId, token, hardwareFingerprint)' }]
  }

  const jwt = verifyJwt(token)
  if (!jwt.valid) {
    log('device/register JWT 无效', { userId })
    return [401, { ok: false, message: 'Token 验证失败' }]
  }
  if (jwt.userId !== userId) {
    log('device/register JWT userId 不匹配', { jwtUserId: jwt.userId, bodyUserId: userId })
    return [403, { ok: false, message: 'Token 与用户不匹配' }]
  }

  const result = registerDeviceInStore(userId, hardwareFingerprint, deviceName || `设备-${hardwareFingerprint.substring(0, 8)}`)

  if (result.blocked) {
    return [200, { ok: false, deviceCount: result.count, maxDevices: MAX_DEVICES, message: `设备数量已达上限(${MAX_DEVICES}台)，请先解绑旧设备` }]
  }
  return [200, { ok: true, deviceCount: result.count, maxDevices: MAX_DEVICES, message: result.isNew ? '设备注册成功' : '设备已存在，已更新' }]
}

function handleDeviceList(body) {
  const { userId, token } = body
  if (!userId || !token) return [400, { ok: false, message: '缺少必要参数' }]

  const jwt = verifyJwt(token)
  if (!jwt.valid) return [401, { ok: false, message: 'Token 验证失败' }]

  const entry = deviceStore.get(userId)
  const devices = entry ? entry.devices : []
  return [200, { ok: true, deviceCount: devices.length, maxDevices: MAX_DEVICES, devices }]
}

function handleDeviceUnbind(body) {
  const { userId, token, fingerprint } = body
  if (!userId || !token || !fingerprint) return [400, { ok: false, message: '缺少必要参数' }]

  const jwt = verifyJwt(token)
  if (!jwt.valid) return [401, { ok: false, message: 'Token 验证失败' }]
  if (jwt.userId !== userId) return [403, { ok: false, message: 'Token 与用户不匹配' }]

  const result = unbindDeviceInStore(userId, fingerprint)
  return [200, { ok: true, deviceCount: result.count, maxDevices: MAX_DEVICES, message: '设备已解绑' }]
}

// ═══════════════════════════════════════
// 妙搭 OpenAPI 代理
// ═══════════════════════════════════════

function proxyToMiaoda(openapiPath) {
  return async (body) => {
    if (!MIAODA_API_KEY) {
      log('妙搭 API Key 未配置')
      return [502, { success: false, message: '认证服务未配置' }]
    }
    try {
      const result = await miaodaRequest(openapiPath, body)
      return [200, result]
    } catch (e) {
      log('妙搭代理请求失败', { path: openapiPath, error: e.message })
      return [502, { success: false, message: `认证服务不可用: ${e.message}` }]
    }
  }
}

function miaodaRequest(path, body) {
  return new Promise((resolve, reject) => {
    const base = new URL(MIAODA_API_BASE)
    const fullPath = base.pathname.replace(/\/$/, '') + path
    const payload = JSON.stringify(body)
    const req = https.request({
      hostname: base.hostname,
      port: 443,
      path: fullPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIAODA_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (_) { resolve({ success: false, message: data }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(payload)
    req.end()
  })
}

// ═══════════════════════════════════════
// 路由表
// ═══════════════════════════════════════

const routes = {
  '/api/activation':            { handler: handleActivation },
  '/api/device/check':          { handler: handleDeviceCheck },
  '/api/device/register':       { handler: handleDeviceRegister },
  '/api/device/list':           { handler: handleDeviceList },
  '/api/device/unbind':         { handler: handleDeviceUnbind },
  '/api/auth/send-sms-code':    { handler: proxyToMiaoda('/openapi/auth/send-sms-code') },
  '/api/auth/sms-login':        { handler: proxyToMiaoda('/openapi/auth/sms-login') },
  '/api/auth/complete-info':    { handler: proxyToMiaoda('/openapi/auth/complete-info') },
  '/api/auth/password-login':   { handler: proxyToMiaoda('/openapi/auth/password-login') },
  '/api/auth/change-password':  { handler: proxyToMiaoda('/openapi/auth/change-password') },
  '/api/auth/send-reset-code':  { handler: proxyToMiaoda('/openapi/auth/send-reset-code') },
  '/api/auth/reset-password':   { handler: proxyToMiaoda('/openapi/auth/reset-password') },
}

function getHandler(path) {
  if (routes[path]) return routes[path].handler
  // fallback: 默认激活码
  return handleActivation
}

// ═══════════════════════════════════════
// HTTP 请求解析与响应
// ═══════════════════════════════════════

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (_) { resolve({}) }
    })
  })
}

function send(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(body))
}

// ═══════════════════════════════════════
// HTTP 服务器
// ═══════════════════════════════════════

const server = http.createServer(async (req, res) => {
  const method = req.method
  const path = req.url.split('?')[0] // 去掉 query string

  log('请求', { method, path })

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' })
    return res.end()
  }

  // 健康检查
  if (method === 'GET' && (path === '/' || path === '')) {
    return send(res, 200, { status: 'ok', service: 'agent-planet', runtime: 'volcengine-vefaas' })
  }

  if (method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = await readBody(req)
    const handler = getHandler(path)
    const handlerResult = handler(body); const [statusCode, result] = handlerResult instanceof Promise ? await handlerResult : handlerResult
    send(res, statusCode, result)
  } catch (e) {
    log('处理异常', { message: e.message, stack: e.stack })
    send(res, 500, { ok: false, message: e.message || String(e) })
  }
})

server.listen(PORT, () => {
  console.log(`[agent-planet] veFaaS listening on port ${PORT}`)
})

// 兼容事件函数写法（万一用户选了事件函数类型也能用）
exports.handler = async (event, context) => {
  const method = event.httpMethod || 'GET'
  const path = event.path || '/'
  let body = {}

  log('请求', { method, path, requestId: context?.requestId })

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{}' }
  }

  if (method === 'GET' && (path === '/' || path === '')) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 'ok', service: 'agent-planet', runtime: 'volcengine-vefaas' }) }
  }

  if (method !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    if (typeof event.body === 'string') {
      try { body = JSON.parse(event.body) } catch (_) { body = {} }
    } else if (event.body && typeof event.body === 'object') {
      body = event.body
    }

    const handler = getHandler(path)
    const handlerResult = handler(body); const [statusCode, result] = handlerResult instanceof Promise ? await handlerResult : handlerResult
    return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) }
  } catch (e) {
    log('处理异常', { message: e.message, stack: e.stack })
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, message: e.message || String(e) }) }
  }
}



