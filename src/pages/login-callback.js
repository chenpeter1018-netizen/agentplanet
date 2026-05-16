/**
 * 登录回调页面
 * 处理 agentplanet://login-callback?... 深链回调
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { navigate } from '../router.js'
import { t } from '../lib/i18n.js'

const LOGIN_FILE = 'web-login.json'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page login-callback-page'
  page.innerHTML = `
    <div class="login-callback-container">
      <div class="login-callback-spinner"></div>
      <p id="callback-status">${t('common.login.processing')}</p>
    </div>
  `

  // 异步处理登录回调
  setTimeout(() => processCallback(page), 100)
  return page
}

async function processCallback(page) {
  const statusEl = page.querySelector('#callback-status')

  try {
    // 1. 解析回调参数（URL hash params 或 deep-link 事件 data）
    const params = resolveCallbackParams()
    if (!params.token || !params.userId) {
      throw new Error('缺少登录参数')
    }

    statusEl.textContent = t('common.login.registering')

    // 2. 调用云端注册设备
    const result = await api.registerDevice(params.userId, params.token)

    if (!result.ok) {
      throw new Error(result.message || t('common.login.deviceRejected'))
    }

    // 3. 保存登录态到本地
    const loginData = {
      token: params.token,
      userId: params.userId,
      phone: params.phone || '',
      nickname: params.nickname || '',
      loggedAt: Date.now(),
      hwfp: await api.getMachineFingerprint().catch(() => ''),
    }

    // 写入 web-login.json（通过 Tauri config 命令写文件）
    try {
      await api.writePanelConfig({ webLogin: loginData })
    } catch (_) {
      // 兼容：直接用 localStorage 兜底
      localStorage.setItem('agent_planet_login', JSON.stringify(loginData))
    }

    statusEl.textContent = t('common.login.success')
    toast.success(t('common.login.success'))

    // 4. 跳转主页
    setTimeout(() => navigate('/agents'), 800)

  } catch (err) {
    // 设备超限 → 弹窗提示 → 退回登录页
    const msg = err.message || t('common.login.failed')
    statusEl.textContent = msg
    toast.error(msg)

    // 清除可能已保存的登录数据
    try {
      await api.writePanelConfig({ webLogin: null })
    } catch (_) {}
    localStorage.removeItem('agent_planet_login')

    // 弹窗提示并跳转回登录页
    if (typeof showModal !== 'undefined') {
      import('../components/modal.js').then(({ showModal }) => {
        showModal({
          title: t('common.login.failed'),
          message: msg,
          confirmText: t('common.login.backToLogin'),
          onConfirm: () => navigate('/login'),
        })
      })
    } else {
      setTimeout(() => navigate('/login'), 2000)
    }
  }
}

/**
 * 解析深链回调参数
 * 优先级：全局事件 > URL query > URL hash params
 */
function resolveCallbackParams() {
  // 优先：从 Rust deep-link 事件注入的全局变量获取
  if (window.__agentplanet_login_callback__) {
    return window.__agentplanet_login_callback__
  }

  // 其次：从当前 URL query 解析（Tauri 内通过 eval 传入）
  const search = window.location.search || window.location.hash
  if (search) {
    const params = {}
    const query = search.includes('?')
      ? search.split('?')[1]
      : search
    new URLSearchParams(query).forEach((v, k) => { params[k] = v })
    if (params.token) return params
  }

  // 最后：从 sessionStorage 读取（postMessage 场景）
  const stored = sessionStorage.getItem('agent_planet_login_payload')
  if (stored) {
    try { return JSON.parse(stored) } catch (_) {}
  }

  return {}
}
