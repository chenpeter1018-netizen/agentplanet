const ACTIVATIONS = {}

exports.main_handler = async (event) => {
  const method = event.httpMethod || 'GET'

  if (method === 'GET') {
    return r(200, { status: 'ok', service: 'agent-planet-activation' })
  }
  if (method !== 'POST') {
    return r(405, { error: 'Method not allowed' })
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || event)
    const { key_id, fingerprint, action, max_machines, expires_at } = body

    if (!key_id) {
      return r(400, { error: 'missing key_id' })
    }

    // gen-license.js 同步：预注册 key_id 元数据
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

    // 客户端激活请求
    if (!fingerprint) {
      return r(400, { error: 'missing fingerprint' })
    }

    // 自动创建记录（兼容未预注册的旧码）
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

    // 客户端传来的 max_machines 只对自动创建的记录生效
    // 已注册的记录以注册时的值为准
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
  } catch (e) {
    return r(500, { error: e.message || String(e) })
  }
}

function r(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  }
}
