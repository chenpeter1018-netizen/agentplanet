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
    const { key_id, fingerprint } = body
    if (!key_id || !fingerprint) {
      return r(400, { error: 'missing key_id or fingerprint' })
    }

    if (!ACTIVATIONS[key_id]) {
      ACTIVATIONS[key_id] = { activations: [], at: Date.now() }
    }

    const entry = ACTIVATIONS[key_id]
    entry.last = Date.now()
    const max = 3

    if (entry.activations.length >= max && entry.activations.indexOf(fingerprint) === -1) {
      return r(403, { error: 'max activations reached (' + max + ')', current: entry.activations.length, max: max })
    }

    if (entry.activations.indexOf(fingerprint) === -1) {
      entry.activations.push(fingerprint)
    }

    const token = Buffer.from(JSON.stringify({ kid: key_id, fp: fingerprint, ts: Date.now() })).toString('base64')

    return r(200, { success: true, token: token, activations: entry.activations.length, max: max })
  } catch (e) {
    return r(500, { error: e.message || String(e) })
  }
}

function r(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  }
}
