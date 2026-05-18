#!/usr/bin/env node
/**
 * 调用豆包 doubao-seed-2.0-pro 识图
 * 用法: node scripts/vision.js <image-path> [prompt]
 */
const fs = require('fs')

const img = fs.readFileSync(process.argv[2])
const b64 = img.toString('base64')
const prompt = process.argv[3] || '请详细描述这张截图中的内容，包括所有文字、按钮、界面布局和任何错误信息。用中文回复。'

fetch('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer bf6243e4-faab-4be1-b9b3-f1597c214680'
  },
  body: JSON.stringify({
    model: 'doubao-seed-2.0-pro',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        { type: 'text', text: prompt }
      ]
    }],
    max_tokens: 2000
  })
}).then(r => r.json()).then(data => {
  console.log(data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2))
}).catch(err => { console.error(err); process.exit(1) })
