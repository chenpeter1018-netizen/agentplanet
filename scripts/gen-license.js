#!/usr/bin/env node
/**
 * Agent Planet 注册码生成器（开发者工具）
 * 用法:
 *   node scripts/gen-license.js  --licensee "客户名" --max 3 --days 365
 *   node scripts/gen-license.js  --licensee "张三" --max 3        # 永久
 *   node scripts/gen-license.js  --licensee "试用用户" --max 1 --days 30
 *   node scripts/gen-license.js  --keypair                       # 生成新密钥对
 */

import { randomBytes, createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_FILE = join(__dirname, '..', '.license-key.json')

// Base32 字母表（排除 0/O/1/I/L）
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// ═══════ 简易 Ed25519（使用 Node.js crypto） ═══════

function base32Encode(bytes) {
  let bits = 0, count = 0, out = ''
  for (const b of bytes) {
    bits = (bits << 8) | b
    count += 8
    while (count >= 5) {
      out += B32[(bits >> (count - 5)) & 31]
      count -= 5
    }
  }
  if (count > 0) out += B32[(bits << (5 - count)) & 31]
  return out
}

function generateKeypair() {
  // Node.js 没有原生 Ed25519，使用 crypto.generateKeyPairSync
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  })

  // 提取原始 32 字节公钥（DER 编码中最后 32 字节）
  const pubDer = Buffer.from(publicKey)
  const pubRaw = pubDer.slice(pubDer.length - 32)
  const priDer = Buffer.from(privateKey)
  // 提取原始 32 字节私钥（DER 编码中最后 32 字节）
  const priRaw = priDer.slice(priDer.length - 32)

  return { pubRaw, priRaw }
}

function sign(payload, privateKeyRaw) {
  const sign = crypto.createSign('SHA-256')
  sign.update(payload)
  sign.end()
  const signature = sign.sign({ key: crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]),
      privateKeyRaw,
    ]), format: 'der', type: 'pkcs8'
  }), 'hex' })
  return Buffer.from(sign, 'hex')
}

// ═══════ 主流程 ═══════

function loadOrCreateKeypair() {
  if (existsSync(KEY_FILE)) {
    const data = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
    return {
      priRaw: Buffer.from(data.privateKey, 'hex'),
      pubRaw: Buffer.from(data.publicKey, 'hex'),
    }
  }

  console.log('🔑 首次使用，生成新密钥对...')
  const { pubRaw, priRaw } = generateKeypair()

  writeFileSync(KEY_FILE, JSON.stringify({
    privateKey: priRaw.toString('hex'),
    publicKey: pubRaw.toString('hex'),
    note: '私钥请妥善保管，不要提交到 Git',
  }, null, 2))

  console.log(`✅ 密钥对已保存到 ${KEY_FILE}`)
  console.log('⚠️  请将 .license-key.json 加入 .gitignore！')

  // 输出 Rust 格式的公钥
  console.log('\n// 更新 src-tauri/src/license.rs 中的 PUBLIC_KEY_BYTES:')
  console.log(`const PUBLIC_KEY_BYTES: [u8; 32] = [`)
  for (let i = 0; i < 32; i += 8) {
    const line = Array.from(pubRaw.slice(i, i + 8))
      .map(b => '0x' + b.toString(16).padStart(2, '0'))
      .join(', ')
    console.log(`    ${line},`)
  }
  console.log(`];`)

  return { pubRaw, priRaw }
}

function generateLicense(opts) {
  const { pubRaw, priRaw } = loadOrCreateKeypair()

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
  const payloadBytes = Buffer.from(payloadJson, 'utf8')
  const signature = sign(payloadBytes, priRaw)

  // 签名(64) + 载荷 → Base32 → 分组
  const raw = Buffer.concat([signature, payloadBytes])
  const encoded = base32Encode(raw)

  // 每 4 个字符一组
  const groups = []
  for (let i = 0; i < encoded.length; i += 4) {
    groups.push(encoded.slice(i, i + 4))
  }
  const key = 'AGPT-' + groups.join('-')

  console.log('\n📜 注册码:')
  console.log(key)
  console.log('\n📋 详情:')
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
  const { pubRaw, priRaw } = loadOrCreateKeypair()
  console.log('\n// PUBLIC_KEY_BYTES (Rust 格式):')
  console.log('const PUBLIC_KEY_BYTES: [u8; 32] = [')
  for (let i = 0; i < 32; i += 8) {
    const line = Array.from(pubRaw.slice(i, i + 8))
      .map(b => '0x' + b.toString(16).padStart(2, '0'))
      .join(', ')
    console.log(`    ${line},`)
  }
  console.log('];')
  process.exit(0)
}

function getArg(name, fallback) {
  const idx = args.indexOf(name)
  if (idx === -1) return fallback
  return args[idx + 1] || fallback
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

generateLicense(opts)
