/**
 * 完善信息页面 — 原生 UI，首次注册用户设置用户名和密码
 */
import { api } from '../lib/tauri-api.js'
import { navigate } from '../router.js'

export async function render() {
  // 从 sessionStorage 读取登录负载（含 phone）
  const stored = sessionStorage.getItem('agent_planet_login_payload')
  let phone = ''
  if (stored) {
    try { phone = JSON.parse(stored).phone || '' } catch (_) {}
  }

  const page = document.createElement('div')
  page.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif'

  page.innerHTML = `
    <div class="ci-card">
      <div class="ci-header">
        <div class="ci-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <h1 class="ci-title">完善信息</h1>
        <p class="ci-subtitle">设置用户名和密码以完成注册</p>
      </div>

      <div class="ci-form">
        <div class="ci-field">
          <label class="ci-label">用户名</label>
          <input class="ci-input" id="ci-username" type="text" placeholder="请输入用户名" maxlength="20" autocomplete="username" />
        </div>

        <div class="ci-field">
          <label class="ci-label">密码</label>
          <input class="ci-input" id="ci-password" type="password" placeholder="请输入密码（至少6位）" autocomplete="new-password" />
        </div>

        <div class="ci-field">
          <label class="ci-label">确认密码</label>
          <input class="ci-input" id="ci-password2" type="password" placeholder="请再次输入密码" autocomplete="new-password" />
        </div>

        <div class="ci-error" id="ci-error"></div>

        <button class="ci-submit" id="ci-submit">完成注册</button>
      </div>
    </div>
  `

  const style = document.createElement('style')
  style.textContent = `
    .ci-card { width: 380px; max-width: 92vw; background: #fff; border-radius: 20px; padding: 40px 32px 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04); }
    .ci-header { text-align: center; margin-bottom: 24px; }
    .ci-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .ci-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0 0 4px; letter-spacing: -0.5px; }
    .ci-subtitle { font-size: 13px; color: #71717a; margin: 0; }
    .ci-form { display: flex; flex-direction: column; gap: 16px; }
    .ci-field { display: flex; flex-direction: column; gap: 6px; }
    .ci-label { font-size: 12px; font-weight: 700; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.5px; }
    .ci-input { width: 100%; height: 44px; padding: 0 14px; border: 1.5px solid #e4e4e7; border-radius: 10px; font-size: 15px; color: #18181b; outline: none; transition: border-color 0.2s; box-sizing: border-box; background: #fafafa; }
    .ci-input:focus { border-color: #6366f1; background: #fff; }
    .ci-submit { width: 100%; height: 48px; border: none; border-radius: 12px; background: #18181b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    .ci-submit:hover { background: #27272a; }
    .ci-submit:active { transform: scale(0.98); }
    .ci-submit:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .ci-error { font-size: 13px; color: #ef4444; text-align: center; min-height: 20px; font-weight: 500; }
  `
  page.appendChild(style)

  const usernameInput = page.querySelector('#ci-username')
  const passwordInput = page.querySelector('#ci-password')
  const password2Input = page.querySelector('#ci-password2')
  const submitBtn = page.querySelector('#ci-submit')
  const errorEl = page.querySelector('#ci-error')

  submitBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim()
    const password = passwordInput.value
    const password2 = password2Input.value

    if (!username || username.length < 2) {
      errorEl.textContent = '用户名至少2个字符'
      return
    }
    if (!password || password.length < 6) {
      errorEl.textContent = '密码至少6位'
      return
    }
    if (password !== password2) {
      errorEl.textContent = '两次密码输入不一致'
      return
    }

    errorEl.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = '提交中...'

    try {
      const result = await api.completeUserInfo(phone, username, password)

      if (!result.success) {
        errorEl.textContent = result.message || '注册失败'
        submitBtn.disabled = false
        submitBtn.textContent = '完成注册'
        return
      }

      const payload = {
        token: result.token,
        userId: result.userId,
        phone: phone,
        nickname: username,
      }
      sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
      navigate('/login-callback')
    } catch (err) {
      errorEl.textContent = err.message || '网络错误，请稍后重试'
      submitBtn.disabled = false
      submitBtn.textContent = '完成注册'
    }
  })

  page.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click()
  })

  const cleanup = () => page.remove()
  page._destroy = cleanup

  setTimeout(() => usernameInput.focus(), 100)

  return page
}
