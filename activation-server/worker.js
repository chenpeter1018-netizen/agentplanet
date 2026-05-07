/**
 * Agent Planet 在线激活 API — Cloudflare Workers 版本
 * 部署: npx wrangler deploy
 */

// 激活数据库（Cloudflare Workers KV，部署后绑定）
// 暂时用内存存储（每次冷启动丢失，适合测试；生产请绑定 KV）
const ACTIVATIONS = {}

export default {
  async fetch(request, env, ctx) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }

    const url = new URL(request.url)

    // 健康检查
    if (url.pathname === '/' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'agent-planet-activation' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (url.pathname !== '/api/activate') {
      return new Response('Not Found', { status: 404 })
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: '请使用 POST 请求' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    try {
      const { key_id, fingerprint } = await request.json()
      if (!key_id || !fingerprint) {
        return Response.json({ error: '缺少 key_id 或 fingerprint' }, { status: 400 })
      }

      // 使用 KV（生产）或内存（测试）
      const db = env.LICENSE_KV ? await env.LICENSE_KV.get('db', 'json') || {} : ACTIVATIONS

      if (!db[key_id]) {
        db[key_id] = { activations: [], activated_at: Date.now() }
      }

      const entry = db[key_id]
      const max = 3 // 默认最大机器数

      if (entry.activations.length >= max && !entry.activations.includes(fingerprint)) {
        return Response.json({
          error: `已达到最大激活数 (${max})`,
          current: entry.activations.length,
          max,
        }, { status: 403 })
      }

      if (!entry.activations.includes(fingerprint)) {
        entry.activations.push(fingerprint)
      }

      // 持久化
      if (env.LICENSE_KV) {
        await env.LICENSE_KV.put('db', JSON.stringify(db))
      } else {
        Object.assign(ACTIVATIONS, db)
      }

      const token = btoa(JSON.stringify({ kid: key_id, fp: fingerprint, ts: Date.now() }))

      return Response.json({
        success: true,
        token,
        activations: entry.activations.length,
        max,
      })

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 })
    }
  }
}
