/**
 * 找回密码 — 原生 UI，短信验证码重置，通过云函数代理调用妙搭 OpenAPI
 */
import { api } from '../lib/tauri-api.js'
import { navigate } from '../router.js'

export async function render() {
  const page = document.createElement('div')
  page.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif'

  page.innerHTML = `
    <div class="fp-card">
      <div class="fp-header">
        <div class="fp-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
            <path d="M12 15v2"/>
          </svg>
        </div>
        <h1 class="fp-title">找回密码</h1>
        <p class="fp-subtitle">通过短信验证码重置登录密码</p>
      </div>

      <div class="fp-form">
        <div class="fp-field">
          <label class="fp-label">手机号</label>
          <div class="fp-phone-wrap">
            <span class="fp-prefix">+86</span>
            <input class="fp-input" id="fp-phone" type="tel" placeholder="请输入手机号" maxlength="11" autocomplete="tel" />
          </div>
        </div>

        <div class="fp-field">
          <label class="fp-label">验证码</label>
          <div class="fp-code-wrap">
            <input class="fp-input" id="fp-code" type="text" placeholder="请输入验证码" maxlength="6" autocomplete="one-time-code" />
            <button class="fp-send-btn" id="fp-send-btn">获取验证码</button>
          </div>
        </div>

        <div class="fp-field">
          <label class="fp-label">新密码</label>
          <input class="fp-input" id="fp-password" type="password" placeholder="请输入新密码（至少6位）" autocomplete="new-password" />
        </div>

        <div class="fp-field">
          <label class="fp-label">确认新密码</label>
          <input class="fp-input" id="fp-password2" type="password" placeholder="请再次输入新密码" autocomplete="new-password" />
        </div>

        <div class="fp-error" id="fp-error"></div>

        <button class="fp-submit" id="fp-submit">重置密码</button>
        <button class="fp-back" id="fp-back">返回登录</button>
      </div>
    </div>
  `

  const style = document.createElement('style')
  style.textContent = `
    .fp-card { width: 380px; max-width: 92vw; background: #fff; border-radius: 20px; padding: 40px 32px 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04); }
    .fp-header { text-align: center; margin-bottom: 24px; }
    .fp-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg,#f59e0b,#ef4444); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .fp-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0 0 4px; letter-spacing: -0.5px; }
    .fp-subtitle { font-size: 13px; color: #71717a; margin: 0; }
    .fp-form { display: flex; flex-direction: column; gap: 16px; }
    .fp-field { display: flex; flex-direction: column; gap: 6px; }
    .fp-label { font-size: 12px; font-weight: 700; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.5px; }
    .fp-input { width: 100%; height: 44px; padding: 0 14px; border: 1.5px solid #e4e4e7; border-radius: 10px; font-size: 15px; color: #18181b; outline: none; transition: border-color 0.2s; box-sizing: border-box; background: #fafafa; }
    .fp-input:focus { border-color: #f59e0b; background: #fff; }
    .fp-phone-wrap { display: flex; gap: 0; }
    .fp-prefix { display: flex; align-items: center; padding: 0 12px; background: #f4f4f5; border: 1.5px solid #e4e4e7; border-right: none; border-radius: 10px 0 0 10px; font-size: 14px; font-weight: 600; color: #52525b; white-space: nowrap; }
    .fp-phone-wrap .fp-input { border-radius: 0 10px 10px 0; }
    .fp-code-wrap { display: flex; gap: 10px; }
    .fp-code-wrap .fp-input { flex: 1; }
    .fp-send-btn { flex-shrink: 0; height: 44px; padding: 0 16px; border: none; border-radius: 10px; background: #f59e0b; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .fp-send-btn:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .fp-send-btn:not(:disabled):hover { background: #d97706; }
    .fp-send-btn:not(:disabled):active { transform: scale(0.97); }
    .fp-submit { width: 100%; height: 48px; border: none; border-radius: 12px; background: #18181b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    .fp-submit:hover { background: #27272a; }
    .fp-submit:active { transform: scale(0.98); }
    .fp-submit:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .fp-back { width: 100%; height: 40px; border: none; background: transparent; color: #71717a; font-size: 13px; font-weight: 600; cursor: pointer; }
    .fp-back:hover { color: #3f3f46; }
    .fp-error { font-size: 13px; color: #ef4444; text-align: center; min-height: 20px; font-weight: 500; }
  `
  page.appendChild(style)

  const phoneEl = page.querySelector('#fp-phone')
  const codeEl = page.querySelector('#fp-code')
  const passwordEl = page.querySelector('#fp-password')
  const password2El = page.querySelector('#fp-password2')
  const sendBtn = page.querySelector('#fp-send-btn')
  const submitBtn = page.querySelector('#fp-submit')
  const backBtn = page.querySelector('#fp-back')
  const errorEl = page.querySelector('#fp-error')

  let countdownTimer = null

  sendBtn.addEventListener('click', async () => {
    const phone = phoneEl.value.trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      errorEl.textContent = '请输入正确的手机号'
      return
    }
    errorEl.textContent = ''
    sendBtn.disabled = true
    sendBtn.textContent = '发送中...'

    try {
      const result = await api.sendResetCode(phone)
      if (!result.success) {
        errorEl.textContent = result.message || '发送验证码失败'
        sendBtn.disabled = false
        sendBtn.textContent = '获取验证码'
        return
      }
      let sec = 60
      sendBtn.textContent = `${sec}s 后重发`
      countdownTimer = setInterval(() => {
        sec--
        sendBtn.textContent = `${sec}s 后重发`
        if (sec <= 0) {
          clearInterval(countdownTimer)
          countdownTimer = null
          sendBtn.disabled = false
          sendBtn.textContent = '获取验证码'
        }
      }, 1000)
    } catch (err) {
      errorEl.textContent = err.message || '网络错误，请稍后重试'
      sendBtn.disabled = false
      sendBtn.textContent = '获取验证码'
    }
  })

  backBtn.addEventListener('click', () => navigate('/login'))

  submitBtn.addEventListener('click', async () => {
    const phone = phoneEl.value.trim()
    const code = codeEl.value.trim()
    const password = passwordEl.value
    const password2 = password2El.value

    if (!/^1[3-9]\d{9}$/.test(phone)) { errorEl.textContent = '请输入正确的手机号'; return }
    if (!code) { errorEl.textContent = '请输入验证码'; return }
    if (!password || password.length < 6) { errorEl.textContent = '新密码至少6位'; return }
    if (password !== password2) { errorEl.textContent = '两次密码输入不一致'; return }

    errorEl.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = '重置中...'

    try {
      const result = await api.resetPassword(phone, code, password)
      if (!result.success) {
        errorEl.textContent = result.message || '重置失败'
        submitBtn.disabled = false
        submitBtn.textContent = '重置密码'
        return
      }
      errorEl.style.color = '#10b981'
      errorEl.textContent = '密码重置成功，请重新登录'
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      errorEl.textContent = err.message || '网络错误，请稍后重试'
      submitBtn.disabled = false
      submitBtn.textContent = '重置密码'
    }
  })

  page.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click()
  })

  const cleanup = () => {
    if (countdownTimer) clearInterval(countdownTimer)
    page.remove()
  }
  page._destroy = cleanup

  setTimeout(() => phoneEl.focus(), 100)

  return page
}
