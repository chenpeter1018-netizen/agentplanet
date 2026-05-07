/**
 * 下载 Node.js 和 Git 安装程序到 src-tauri/resources/env/
 * 构建前运行: node scripts/bundle-env.js
 * 若网络不佳可手动下载放入对应目录
 *
 * 目录结构:
 *   src-tauri/resources/env/
 *     windows/
 *       node-v22.x-x64.msi
 *       Git-*-64-bit.exe
 *     macos/
 *       node-v22.x.pkg
 *       git-*-intel-universal.dmg
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { get } from 'https'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESOURCES = join(__dirname, '..', 'src-tauri', 'resources', 'env')
const NODE_VERSION = '22.21.1' // 可更新

const DOWNLOADS = {
  'windows/node-v22.21.1-x64.msi': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-x64.msi`,
    desc: 'Node.js v22 (Windows x64)',
  },
  'macos/node-v22.21.1.pkg': {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.pkg`,
    desc: 'Node.js v22 (macOS)',
  },
  'windows/Git-2.52.0-64-bit.exe': {
    url: 'https://github.com/git-for-windows/git/releases/download/v2.52.0.windows.1/Git-2.52.0-64-bit.exe',
    desc: 'Git (Windows x64)',
  },
  'macos/git-2.52.0-intel-universal.dmg': {
    url: 'https://sourceforge.net/projects/git-osx-installer/files/git-2.52.0-intel-universal.dmg/download',
    desc: 'Git (macOS)',
  },
}

function download(url, dest, desc) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true })
    const file = createWriteStream(dest)
    console.log(`⬇ 下载 ${desc}...`)
    get(url, { headers: { 'User-Agent': 'Agent-Planet-Builder' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随重定向
        file.close()
        download(res.headers.location, dest, desc).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        console.log(`  ⚠ HTTP ${res.statusCode} — 跳过 (需手动下载)`)
        resolve()
        return
      }
      const total = parseInt(res.headers['content-length'], 10)
      let downloaded = 0
      res.on('data', (chunk) => {
        downloaded += chunk.length
        if (total) process.stdout.write(`\r  ${Math.round(downloaded / total * 100)}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`)
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); console.log('\n  ✅ 完成'); resolve() })
      file.on('error', reject)
    }).on('error', (e) => {
      console.log(`  ⚠ ${e.message} — 跳过 (需手动下载)`)
      resolve()
    })
  })
}

async function main() {
  console.log('Agent Planet — 环境程序打包\n')

  let downloaded = 0
  for (const [path, { url, desc }] of Object.entries(DOWNLOADS)) {
    const dest = join(RESOURCES, path)
    if (existsSync(dest)) {
      console.log(`✓ ${desc} — 已存在，跳过`)
      continue
    }
    try {
      await download(url, dest, desc)
      downloaded++
    } catch (e) {
      console.log(`  ⚠ 下载失败: ${e.message}`)
    }
  }

  console.log(`\n完成: ${downloaded} 个新下载, ${Object.keys(DOWNLOADS).length - downloaded} 个已存在/跳过`)
  console.log(`环境程序目录: ${RESOURCES}`)
}

main().catch(console.error)
