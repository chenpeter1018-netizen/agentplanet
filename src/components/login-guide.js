/**
 * 登录引导页面
 * 未登录时显示，引导用户打开妙搭登录页完成手机验证
 */
import { api, isTauriRuntime } from '../lib/tauri-api.js'
import { navigate } from '../router.js'
import { t } from '../lib/i18n.js'

const MIAODA_URL = 'https://m2gtpsn7tp.aiforce.cloud/app/app_4k541hw8u493p'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page login-guide-page'

  const hwfp = await api.getMachineFingerprint().catch(() => '')

  page.innerHTML = `
    <div class="login-guide-container">
      <div class="login-guide-card">
        <div class="login-guide-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2>${t('common.login.title')}</h2>
        <p class="login-guide-desc">${t('common.login.desc')}</p>

        <div class="login-guide-steps">
          <div class="login-step">
            <span class="login-step-num">1</span>
            <span>${t('common.login.step1')}</span>
          </div>
          <div class="login-step">
            <span class="login-step-num">2</span>
            <span>${t('common.login.step2')}</span>
          </div>
          <div class="login-step">
            <span class="login-step-num">3</span>
            <span>${t('common.login.step3')}</span>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-open-login" style="width:100%;padding:12px;font-size:15px">
          ${t('common.login.openPage')}
        </button>

        <p class="login-guide-hwfp">
          <small>${t('common.login.deviceId')}: ${hwfp ? hwfp.substring(0, 12) + '...' : '...'}</small>
        </p>
      </div>
    </div>
  `

  // 打开妙搭登录页
  page.querySelector('#btn-open-login').addEventListener('click', () => {
    const url = `${MIAODA_URL}?hwfp=${encodeURIComponent(hwfp)}`
    if (isTauriRuntime()) {
      // Tauri 环境：用系统浏览器打开
      api.openInFileManager ? void 0 : window.open(url, '_blank')
    } else {
      window.open(url, '_blank')
    }
  })

  // 监听 postMessage（妙搭登录成功后通知）
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'AGENTPLANET_LOGIN_SUCCESS') {
      const payload = event.data.payload
      if (payload?.token) {
        // 存储到 session，然后跳转回调页处理
        sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
        navigate('/login-callback')
      }
    }
  })

  return page
}
