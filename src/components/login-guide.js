/**
 * 登录页面 — 全屏嵌入妙搭手机验证登录
 */
import { api } from '../lib/tauri-api.js'
import { navigate } from '../router.js'

const LOGIN_URL = 'https://m2gtpsn7tp.aiforce.cloud/app/app_4k541hw8u493p/login'

export async function render() {
  const page = document.createElement('div')
  page.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff'

  const hwfp = await api.getMachineFingerprint().catch(() => '')

  const iframe = document.createElement('iframe')
  iframe.src = `${LOGIN_URL}?hwfp=${encodeURIComponent(hwfp)}`
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block'
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')

  page.appendChild(iframe)

  const onMessage = (event) => {
    if (event.data?.type === 'AGENTPLANET_LOGIN_SUCCESS') {
      const payload = event.data.payload
      if (!payload?.token) return

      if (payload.needsCompleteInfo) {
        sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
        navigate('/complete-info')
        return
      }

      sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
      navigate('/login-callback')
    }
  }
  window.addEventListener('message', onMessage)

  const cleanup = () => {
    window.removeEventListener('message', onMessage)
    page.remove()
  }
  page._destroy = cleanup

  return page
}
