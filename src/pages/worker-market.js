/**
 * Agent Planet 数字员工市场
 * 预配置模板卡片 + 一键实例化
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

const TEMPLATES = [
  {
    id: 'general-assistant',
    name: '通用助理',
    emoji: '🤖',
    desc: '全能型 AI 助手，适用于日常问答、写作辅助、代码建议等场景。',
    model: 'gpt-4o',
    workspace: 'general-assistant',
    tags: ['通用', '入门'],
  },
  {
    id: 'code-reviewer',
    name: '代码审查员',
    emoji: '🔍',
    desc: '专注于代码审查，自动检测潜在 Bug、安全漏洞和代码风格问题。',
    model: 'claude-sonnet-4-20250514',
    workspace: 'code-reviewer',
    tags: ['开发', '审查'],
  },
  {
    id: 'data-analyst',
    name: '数据分析师',
    emoji: '📊',
    desc: '擅长数据清洗、统计分析和可视化建议，支持 CSV/JSON 等格式。',
    model: 'gpt-4o',
    workspace: 'data-analyst',
    tags: ['数据', '分析'],
  },
  {
    id: 'translator',
    name: '翻译官',
    emoji: '🌐',
    desc: '多语种翻译专家，支持中/英/日/韩/法/德等主流语言互译。',
    model: 'claude-haiku-4-5-20251001',
    workspace: 'translator',
    tags: ['语言', '翻译'],
  },
  {
    id: 'doc-writer',
    name: '文档撰写师',
    emoji: '📝',
    desc: '自动生成 API 文档、README、变更日志等，保持一致的文档风格。',
    model: 'claude-sonnet-4-20250514',
    workspace: 'doc-writer',
    tags: ['文档', '写作'],
  },
  {
    id: 'devops-helper',
    name: '运维助手',
    emoji: '⚙️',
    desc: '协助 Docker/K8s 配置、CI/CD 脚本编写、故障排查等运维工作。',
    model: 'gpt-4o-mini',
    workspace: 'devops-helper',
    tags: ['运维', 'DevOps'],
  },
]

export async function render() {
  const el = document.createElement('div')
  el.className = 'page'
  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('digitalWorkers.workerMarket')}</div>
        <div class="page-desc">${tl('digitalWorkers.marketSync')}</div>
      </div>
    </div>
    <div id="market-grid"></div>
  `
  renderMarket(el.querySelector('#market-grid'))
  return el
}

export function renderMarket(container) {
  if (!container) return

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
      ${TEMPLATES.map(t => `
        <div class="card" style="cursor:pointer;transition:transform .15s,box-shadow .15s" data-action="template-detail" data-template-id="${t.id}">
          <div class="card-body" style="padding:18px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="font-size:28px">${t.emoji}</div>
              <div>
                <div style="font-weight:600;font-size:var(--font-size-base)">${escHtml(t.name)}</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${escHtml(t.model)}</div>
              </div>
            </div>
            <div style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:10px">${escHtml(t.desc)}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${(t.tags || []).map(tag => `<span class="badge badge-info">${escHtml(tag)}</span>`).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `

  container.querySelectorAll('[data-action="template-detail"]').forEach(card => {
    card.addEventListener('click', () => showTemplateDetail(card.dataset.templateId))
  })
}

function showTemplateDetail(templateId) {
  const t = TEMPLATES.find(t => t.id === templateId)
  if (!t) return

  showModal({
    title: `${t.emoji} ${escHtml(t.name)}`,
    content: `
      <div style="line-height:1.8">
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:12px">${escHtml(t.desc)}</p>
        <div style="font-size:var(--font-size-sm);margin-bottom:4px"><strong>${tl('digitalWorkers.agentModel')}:</strong> ${escHtml(t.model)}</div>
        <div style="font-size:var(--font-size-sm);margin-bottom:4px"><strong>${tl('digitalWorkers.agentWorkspace')}:</strong> ${escHtml(t.workspace)}</div>
        <div style="margin-top:8px">${(t.tags || []).map(tag => `<span class="badge badge-info" style="margin-right:4px">${escHtml(tag)}</span>`).join('')}</div>
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-instantiate">${tl('digitalWorkers.templateInstantiate')}</button>
    `
  })

  setTimeout(() => {
    document.getElementById('btn-instantiate')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-instantiate')
      btn.disabled = true
      btn.textContent = tl('common.processing')

      const agent = {
        id: `${t.id}-${Date.now().toString(36)}`,
        name: t.name,
        emoji: t.emoji,
        model: t.model,
        workspace: t.workspace,
      }

      try {
        await bridge.createAgent(agent)
        document.querySelector('.modal-overlay')?.remove()
        toast(tl('common.success'), 'success')
      } catch (err) {
        btn.disabled = false
        btn.textContent = tl('digitalWorkers.templateInstantiate')
        toast(err.message || tl('common.error'), 'error')
      }
    })
  }, 50)
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function cleanup() {}
