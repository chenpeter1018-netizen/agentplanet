/**
 * Agent Planet 在线激活 API
 * POST /api/activate
 *
 * 部署: vercel deploy （使用 KV 存储，或 json 文件存储）
 * 本地测试: node -e "require('./api/activate')" && vercel dev
 */

// ═══════ 激活配额（部署前修改）═══════
const MAX_MACHINES_DEFAULT = 3
const LICENSE_DB = {
  // key_id → { max_machines, activations: [fingerprint], expires_at, licensee }
}

// ═══════ 简单的 JSON 文件持久化（Vercel 上改 KV）═══════
// Vercel KV 版本在下面注释中，当前用内存存储（适合测试）

// Vercel KV 版本（取消注释以使用）:
// import { kv } from '@vercel/kv'
// async function getDB() { return (await kv.get('license_db')) || {} }
// async function putDB(db) { await kv.set('license_db', db) }

// 内存存储（仅测试用，Vercel serverless 每次重启会丢失）
let db = { ...LICENSE_DB }

async function getDB() { return db }
async function putDB(newDb) { db = newDb }

// ═══════ API Handler ═══════

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { key_id, fingerprint, product, licensee } = req.body || {}

    if (!key_id || !fingerprint) {
      return res.status(400).json({ error: '缺少 key_id 或 fingerprint' })
    }

    const db = await getDB()

    // 初始化或获取许可证条目
    if (!db[key_id]) {
      db[key_id] = {
        max_machines: MAX_MACHINES_DEFAULT,
        activations: [],
        activated_at: Date.now(),
        last_seen: Date.now(),
      }
    }

    const entry = db[key_id]
    entry.last_seen = Date.now()

    // 检查是否超过最大机器数
    if (entry.activations.length >= entry.max_machines
        && !entry.activations.includes(fingerprint)) {
      return res.status(403).json({
        error: `已达到最大激活数 (${entry.max_machines})`,
        current: entry.activations.length,
        max: entry.max_machines,
      })
    }

    // 记录激活
    if (!entry.activations.includes(fingerprint)) {
      entry.activations.push(fingerprint)
    }

    await putDB(db)

    // 生成简单的激活令牌
    const token = Buffer.from(JSON.stringify({
      kid: key_id,
      fp: fingerprint,
      ts: Date.now(),
    })).toString('base64')

    return res.json({
      success: true,
      token,
      activations: entry.activations.length,
      max: entry.max_machines,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
