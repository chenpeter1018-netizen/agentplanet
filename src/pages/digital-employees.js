/**
 * 数字员工页面 — Tab: Agent 管理 + 员工市场
 */
import { t } from '../lib/i18n.js'
import { toast } from '../components/toast.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('sidebar.digitalEmployees')}</h1>
    </div>
    <div class="de-tabs" style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border-secondary);padding-bottom:0">
      <button class="de-tab active" data-tab="management">${t('agents.title', '员工管理')}</button>
      <button class="de-tab" data-tab="market">${t('agents.employeeMarket', '员工市场')}</button>
    </div>
    <div id="de-tab-content"></div>
  `

  // Tab 切换
  page.querySelectorAll('.de-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(page, btn.dataset.tab))
  })

  // 默认加载 Agent 管理
  switchTab(page, 'management')

  return page
}

async function switchTab(page, tab) {
  page.querySelectorAll('.de-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  const container = page.querySelector('#de-tab-content')
  container.innerHTML = '<div class="skeleton-line" style="height:200px"></div>'

  if (tab === 'management') {
    const mod = await import('./agents.js')
    const agentsPage = await mod.render()
    container.innerHTML = ''
    container.appendChild(agentsPage)
  } else if (tab === 'market') {
    renderMarket(container)
  }
}

// ── 员工市场 ──

const MARKET_EMPLOYEES = [
  {
    id: 'code-reviewer',
    name: '代码审查员',
    nameEn: 'Code Reviewer',
    role: '审查代码质量、发现潜在bug',
    desc: '精通多种编程语言，专注代码安全性、性能和可维护性审查。能快速定位逻辑漏洞、安全风险和代码异味，提供详细的改进建议。',
    skills: ['代码审查', '安全分析', '性能优化', '多语言'],
    avatar: '/images/avatars/Code Reviewer.png',
  },
  {
    id: 'data-analyst',
    name: '数据分析师',
    nameEn: 'Data Analyst',
    role: '数据洞察、报表生成、趋势分析',
    desc: '擅长从海量数据中提取关键洞察，生成可视化报表。支持 SQL 查询、统计分析、趋势预测，帮助团队做出数据驱动的决策。',
    skills: ['SQL', '数据可视化', '统计分析', '报表生成'],
    avatar: '/images/avatars/Data Analyst.png',
  },
  {
    id: 'tech-writer',
    name: '技术文档工程师',
    nameEn: 'Technical Writer',
    role: 'API 文档、用户手册、技术博客',
    desc: '将复杂的技术概念转化为清晰易懂的文档。擅长编写 API 参考、开发者指南、用户手册和技术博客文章。',
    skills: ['技术写作', 'API 文档', 'Markdown', '多语言'],
    avatar: '/images/avatars/Technical Writer.png',
  },
  {
    id: 'devops-automation',
    name: 'DevOps 自动化师',
    nameEn: 'DevOps Automator',
    role: 'CI/CD 流水线、部署自动化、监控配置',
    desc: '精通 CI/CD 流水线开发和云基础设施管理。能自动完成部署、监控、日志收集等运维任务，保障系统稳定运行。',
    skills: ['CI/CD', 'Docker', 'K8s', '监控'],
    avatar: '/images/avatars/DevOps Automator.png',
  },
  {
    id: 'test-engineer',
    name: '测试工程师',
    nameEn: 'QA Engineer',
    role: '自动化测试、用例设计、质量保障',
    desc: '设计全面的测试策略，编写单元测试、集成测试和端到端测试。确保每个功能上线前都经过充分验证。',
    skills: ['自动化测试', '测试用例', 'E2E', '性能测试'],
    avatar: '/images/avatars/QA Engineer.png',
  },
  {
    id: 'ui-designer',
    name: 'UI 设计师',
    nameEn: 'UI Designer',
    role: '界面设计、组件库、交互优化',
    desc: '擅长设计美观且易用的用户界面。能创建设计系统、组件库，确保产品视觉一致性和良好的用户体验。',
    skills: ['UI 设计', '组件库', 'Figma', 'CSS'],
    avatar: '/images/avatars/UI Designer.png',
  },
  {
    id: 'project-manager',
    name: '项目经理',
    nameEn: 'Project Manager',
    role: '任务分配、进度跟踪、风险管理',
    desc: '协调团队工作，制定项目计划，跟踪进度和里程碑。擅长识别风险、解决阻塞，确保项目按时交付。',
    skills: ['项目管理', 'Sprint', '风险管理', '沟通协调'],
    avatar: '/images/avatars/Project Manager.png',
  },
  {
    id: 'seo-specialist',
    name: 'SEO 专家',
    nameEn: 'SEO Specialist',
    role: '搜索优化、关键词分析、内容策略',
    desc: '精通搜索引擎优化策略。能进行关键词研究、竞品分析，制定内容策略提升网站自然搜索排名和流量。',
    skills: ['SEO', '关键词分析', '内容策略', '技术SEO'],
    avatar: '/images/avatars/SEO Specialist.png',
  },
  {
    id: 'customer-support',
    name: '客服专员',
    nameEn: 'Support Agent',
    role: '用户咨询、问题解答、反馈收集',
    desc: '7x24 小时响应客户咨询，快速解答常见问题，收集用户反馈。语气亲切专业，能妥善处理各类客户需求。',
    skills: ['客户服务', '问题解决', '多语言', 'FAQ'],
    avatar: '/images/avatars/Support Agent.png',
  },
  {
    id: 'legal-advisor',
    name: '法务顾问',
    nameEn: 'Legal Advisor',
    role: '合同审查、合规检查、风险评估',
    desc: '提供法律合规建议，审查合同条款，评估业务风险。熟悉科技行业法律法规，帮助团队规避法律风险。',
    skills: ['合同审查', '合规', '风险评估', '隐私保护'],
    avatar: '/images/avatars/Legal Advisor.png',
  },
]

const MARKET_URL = 'https://m2gtpsn7tp.aiforce.cloud/app/app_4k541hw8u493p/market'

function renderMarket(container) {
  if (!navigator.onLine) {
    renderMarketFallback(container)
    return
  }

  container.innerHTML = `<iframe id="market-iframe" src="${MARKET_URL}"
    style="width:100%;height:calc(100vh - 180px);border:none;border-radius:var(--radius-lg, 8px);background:var(--bg-card, #fff)"
    allow="camera;microphone"
    loading="lazy"
  ></iframe>`

  const iframe = container.querySelector('#market-iframe')
  let resolved = false

  const fallback = () => {
    if (resolved) return
    resolved = true
    renderMarketFallback(container)
  }

  iframe.addEventListener('error', fallback)
  setTimeout(() => { if (!resolved) fallback() }, 15000)
}

function renderMarketFallback(container) {
  container.innerHTML = `
    <div class="market-hint">${t('agents.marketHint', '选择一个数字员工加入你的团队，他们将协助完成各类专业任务。')}</div>
    <div class="market-grid">
      ${MARKET_EMPLOYEES.map(emp => `
        <div class="market-card">
          <div class="market-card-header">
            <img class="market-avatar" src="${emp.avatar}" alt="${emp.name}" loading="lazy" />
            <div class="market-card-title">
              <div class="market-card-name">${emp.name}</div>
              <div class="market-card-name-en">${emp.nameEn}</div>
            </div>
          </div>
          <div class="market-card-role">${emp.role}</div>
          <div class="market-card-desc">${emp.desc}</div>
          <div class="market-card-skills">
            ${emp.skills.map(s => `<span class="market-skill-tag">${s}</span>`).join('')}
          </div>
          <button class="btn btn-primary btn-sm market-hire-btn" data-id="${emp.id}" data-name="${emp.name}">
            ${t('agents.addToTeam', '加入团队')}
          </button>
        </div>
      `).join('')}
    </div>
  `

  container.querySelectorAll('.market-hire-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const name = btn.dataset.name
      const emp = MARKET_EMPLOYEES.find(e => e.id === id)
      btn.disabled = true
      btn.textContent = t('agents.adding', '添加中...')
      try {
        const { api } = await import('../lib/tauri-api.js')
        let model = 'newapi/claude-opus-4-6'
        try {
          const config = await api.readOpenclawConfig()
          const providers = config?.models?.providers || {}
          for (const [pk, pv] of Object.entries(providers)) {
            const firstModel = (pv.models || [])[0]
            if (firstModel) {
              const mid = typeof firstModel === 'string' ? firstModel : firstModel.id
              if (mid) { model = `${pk}/${mid}`; break }
            }
          }
        } catch {}
        await api.addAgent(id, model, null)
        if (name || emp?.avatar) {
          try {
            await api.updateAgentIdentity(id, name || null, emp?.avatar || null)
          } catch {}
        }
        btn.textContent = t('agents.added', '已加入')
        btn.style.background = 'var(--success, #22c55e)'
        btn.style.color = 'var(--text-inverse)'
        toast(t('agents.addSuccess', `${name} 已加入你的团队`), 'success')
      } catch (err) {
        btn.disabled = false
        btn.textContent = t('agents.addToTeam', '加入团队')
        toast(t('common.operationFailed') + ': ' + (err?.message || err), 'error')
      }
    })
  })
}
