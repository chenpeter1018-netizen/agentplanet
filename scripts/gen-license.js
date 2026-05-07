#!/usr/bin/env node
/**
 * Agent Planet 注册码生成器
 * 用法: node scripts/gen-license.js --licensee "客户名" --max 3 --days 365
 */

import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_FILE = join(__dirname, '..', '.license-key.json')
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// ═══════ Crypto ═══════

async function generateKeypair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
  const priRaw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  return { pubRaw, priRaw }
}

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

// ═══════ Key Management ═══════

async function loadOrCreateKeypair() {
  if (existsSync(KEY_FILE)) {
    const data = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
    return {
      pubRaw: Uint8Array.from(Buffer.from(data.publicKey, 'hex')),
      priRaw: Uint8Array.from(Buffer.from(data.privateKey, 'hex')),
    }
  }

  console.log('🔑 首次使用，生成新密钥对...')
  const { pubRaw, priRaw } = await generateKeypair()

  const hex = (arr) => Buffer.from(arr).toString('hex')
  writeFileSync(KEY_FILE, JSON.stringify({
    privateKey: hex(priRaw),
    publicKey: hex(pubRaw),
    note: '私钥请妥善保管，不要提交到 Git',
  }, null, 2))

  console.log(`✅ 密钥对已保存到 ${KEY_FILE}`)
  console.log('⚠️  请将 .license-key.json 加入 .gitignore！')

  // 输出 Rust 格式的公钥（如果这是第一次生成）
  const pkcs8Key = await crypto.subtle.importKey('raw', pubRaw, { name: 'Ed25519' }, true, ['verify'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pkcs8Key))
  // SPKI 格式 Ed25519 公钥的最后 32 字节
  const pubKey32 = spki.slice(spki.length - 32)

  console.log('\n// 更新 src-tauri/src/license.rs 中的 PUBLIC_KEY_BYTES:')
  console.log('const PUBLIC_KEY_BYTES: [u8; 32] = [')
  for (let i = 0; i < 32; i += 8) {
    const line = Array.from(pubKey32.slice(i, i + 8))
      .map(b => '0x' + b.toString(16).padStart(2, '0'))
      .join(', ')
    console.log(`    ${line},`)
  }
  console.log('];')

  return { pubRaw, priRaw }
}

// ═══════ Generate ═══════

async function generateLicense(opts) {
  const { pubRaw, priRaw } = await loadOrCreateKeypair()

  const payload = {
    licensee: opts.licensee || '未命名用户',
    product: 'agent-planet-pro',
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: opts.days
      ? Math.floor(Date.now() / 1000) + opts.days * 86400
      : 0,
    max_machines: opts.max || 3,
    key_id: randomBytes(6).toString('hex'),
  }

  const payloadJson = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadJson)
  const signature = await signEd25519(payloadBytes, priRaw)

  // 签名(64) + 载荷 → Base32 → 分组
  const raw = new Uint8Array([...signature, ...payloadBytes])
  const encoded = base32Encode(raw)

  // 每 4 个字符一组
  const groups = []
  for (let i = 0; i < encoded.length; i += 4) {
    groups.push(encoded.slice(i, i + 4))
  }
  const key = 'AGPT-' + groups.join('-')

  console.log('\n📜 注册码:')
  console.log(`\n  ${key}\n`)
  console.log('  ────────────────')
  console.log(`  授权方: ${payload.licensee}`)
  console.log(`  产品: ${payload.product}`)
  console.log(`  最大机器数: ${payload.max_machines}`)
  console.log(`  到期: ${payload.expires_at ? new Date(payload.expires_at * 1000).toLocaleDateString('zh-CN') : '永久有效'}`)
  console.log(`  注册码 ID: ${payload.key_id}`)
  console.log()

  return key
}

// ═══════ CLI ═══════

const args = process.argv.slice(2)

if (args.includes('--keypair')) {
  await loadOrCreateKeypair()
  process.exit(0)
}

function getArg(name, fallback) {
  const idx = args.indexOf(name)
  return idx === -1 ? fallback : (args[idx + 1] || fallback)
}

const opts = {
  licensee: getArg('--licensee'),
  max: parseInt(getArg('--max', '3')),
  days: getArg('--days') ? parseInt(getArg('--days')) : undefined,
}

if (!opts.licensee) {
  console.log('用法: node scripts/gen-license.js --licensee "客户名" [--max 3] [--days 365]')
  console.log('      node scripts/gen-license.js --keypair  查看/生成密钥对')
  process.exit(1)
}

await generateLicense(opts)
