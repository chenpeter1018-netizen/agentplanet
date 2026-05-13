#!/usr/bin/env node
/**
 * 批量生成 100 个注册码
 * 用法: node scripts/gen-batch-licenses.js
 */
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_FILE = join(__dirname, '..', '.license-key.json')
const OUTPUT_FILE = join(__dirname, '..', 'licenses-100.txt')
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

async function signEd25519(payload, privateKeyPkcs8) {
  const key = await crypto.subtle.importKey(
    'pkcs8', privateKeyPkcs8,
    { name: 'Ed25519' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, payload)
  return new Uint8Array(sig)
}

function base32Encode(bytes) {
  let bits = 0n, count = 0n, out = ''
  for (const b of bytes) {
    bits = (bits << 8n) | BigInt(b)
    count += 8n
    while (count >= 5n) {
      out += B32[Number((bits >> (count - 5n)) & 31n)]
      count -= 5n
    }
  }
  if (count > 0n) out += B32[Number((bits << (5n - count)) & 31n)]
  return out
}

async function generateOne(priRaw, index) {
  const payload = {
    licensee: `Agent Planet User ${String(index + 1).padStart(3, '0')}`,
    product: 'agent-planet-pro',
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 365 * 86400,
    max_machines: 3,
    key_id: randomBytes(6).toString('hex'),
  }
  const payloadJson = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadJson)
  const signature = await signEd25519(payloadBytes, priRaw)
  const raw = new Uint8Array([...signature, ...payloadBytes])
  const encoded = base32Encode(raw)
  const groups = []
  for (let i = 0; i < encoded.length; i += 4) {
    groups.push(encoded.slice(i, i + 4))
  }
  return 'AGPT-' + groups.join('-')
}

// Main
const data = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
const priRaw = Uint8Array.from(Buffer.from(data.privateKey, 'hex'))

const BATCH = 100
const codes = []

for (let i = 0; i < BATCH; i++) {
  const code = await generateOne(priRaw, i)
  codes.push(code)
  process.stdout.write(`\r  ${i + 1}/${BATCH} ...`)
}

writeFileSync(OUTPUT_FILE, codes.join('\n') + '\n')
console.log(`\n✅ 已生成 ${BATCH} 个注册码 → ${OUTPUT_FILE}`)
