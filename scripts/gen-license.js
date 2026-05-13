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
const ACTIVATION_SERVER = 'https://1344713238-grdts5pifw.ap-shanghai.tencentscf.com'

// ═══════ Crypto ═══════

async function deriveShortHmacKey(pubRaw) {
  const prefix = new TextEncoder().encode('agent-planet-short-license-v1')
  const combined = new Uint8Array([...prefix, ...pubRaw])
  const hash = await crypto.subtle.digest('SHA-256', combined)
  return crypto.subtle.importKey(
    'raw', hash,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
}

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
      bits &= (1n << count) - 1n
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

// ═══════ Cloud Sync ═══════

async function syncToCloud(keyId, maxMachines, expiresAt) {
  try {
    // 兼容新旧云函数：旧版要求 fingerprint 字段，新版支持 action:register
    const resp = await fetch(ACTIVATION_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        key_id: keyId,
        fingerprint: '__register__',
        max_machines: maxMachines,
        expires_at: expiresAt,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await resp.json()
    if (data.success) {
      console.log(`☁️  已同步到激活服务器 (key_id: ${keyId}, max: ${maxMachines})`)
    } else {
      console.error(`⚠️  云函数同步失败: ${data.error || JSON.stringify(data)}`)
      if (data.error === 'max activations reached (3)') {
        console.error('   (旧版云函数仍在使用，请部署 activation-server/tencent-scf.js 新版本)')
      }
    }
    return data
  } catch (e) {
    console.error(`⚠️  无法连接激活服务器: ${e.message}`)
    console.error('   注册码已本地生成，但未同步到云端。请手动同步或重试。')
  }
}

// ═══════ Generate ═══════

async function generateLicense(opts) {
  const { pubRaw, priRaw } = await loadOrCreateKeypair()

  const payload = {
    licensee: opts.licensee || '未命名用户',
    product: 'ap',
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

  // 同步到腾讯云激活服务器
  await syncToCloud(payload.key_id, payload.max_machines, payload.expires_at)

  return key
}

async function generateShortLicense(opts) {
  const { pubRaw } = await loadOrCreateKeypair()
  const hmacKey = await deriveShortHmacKey(pubRaw)

  const maxMachines = Math.min(opts.max || 3, 16)
  const days = opts.days || 0

  // 12 bytes total → 20 base32 chars → 5 groups → 6 segments with AGPT
  const payload = new Uint8Array(5)
  // Byte 0: version(4bit) | max_machines-1(4bit)
  payload[0] = (0x01 << 4) | ((maxMachines - 1) & 0x0f)
  // Bytes 1-2: expires_days (u16 LE)
  payload[1] = days & 0xff
  payload[2] = (days >> 8) & 0xff
  // Bytes 3-4: key_id (2 random bytes)
  const keyId = randomBytes(2)
  payload[3] = keyId[0]
  payload[4] = keyId[1]

  const hmacSig = new Uint8Array(
    await crypto.subtle.sign({ name: 'HMAC', hash: 'SHA-256' }, hmacKey, payload)
  )

  const raw = new Uint8Array([...payload, ...hmacSig.slice(0, 7)])
  const encoded = base32Encode(raw)

  const groups = []
  for (let i = 0; i < encoded.length; i += 4) {
    groups.push(encoded.slice(i, i + 4))
  }
  const key = 'AGPT-' + groups.join('-')

  const keyIdHex = Buffer.from(keyId).toString('hex')
  console.log('\n📜 短码注册码:')
  console.log(`\n  ${key}\n`)
  console.log('  ────────────────')
  console.log(`  格式: 短码 v1 (HMAC-SHA256)`)
  console.log(`  最大机器数: ${maxMachines}`)
  console.log(`  到期: ${days ? `${days} 天后` : '永久有效'}`)
  console.log(`  注册码 ID: ${keyIdHex}`)
  console.log()

  // 同步到腾讯云激活服务器
  const expiresAt = days ? Math.floor(Date.now() / 1000) + days * 86400 : 0
  await syncToCloud(keyIdHex, maxMachines, expiresAt)

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

const useShort = args.includes('--short')

const opts = {
  licensee: getArg('--licensee'),
  max: parseInt(getArg('--max', '3')),
  days: getArg('--days') ? parseInt(getArg('--days')) : undefined,
}

if (useShort) {
  await generateShortLicense(opts)
} else {
  if (!opts.licensee) {
    console.log('用法: node scripts/gen-license.js --licensee "客户名" [--max 3] [--days 365]')
    console.log('      node scripts/gen-license.js --short [--max 3] [--days 365]')
    console.log('      node scripts/gen-license.js --keypair  查看/生成密钥对')
    process.exit(1)
  }
  await generateLicense(opts)
}
