/**
 * 手机验证登录页面 — 原生 UI，通过云函数代理调用妙搭 OpenAPI
 */
import { api } from '../lib/tauri-api.js'
import { navigate } from '../router.js'

export async function render() {
  const hwfp = await api.getMachineFingerprint().catch(() => '')

  const page = document.createElement('div')
  page.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif'

  page.innerHTML = `
    <div class="phone-login-card">
      <div class="phone-login-header">
        <div class="phone-login-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
          </svg>
        </div>
        <h1 class="phone-login-title">Agent Planet</h1>
        <p class="phone-login-subtitle">手机验证码登录</p>
      </div>

      <div class="phone-login-tabs">
        <button class="phone-login-tab active" data-tab="sms">验证码登录</button>
        <button class="phone-login-tab" data-tab="password">密码登录</button>
      </div>

      <div class="phone-login-form">
        <div class="phone-login-field">
          <label class="phone-login-label">手机号</label>
          <div class="phone-login-phone-wrap">
            <span class="phone-login-prefix">+86</span>
            <input class="phone-login-input" id="pl-phone" type="tel" placeholder="请输入手机号" maxlength="11" autocomplete="tel" />
          </div>
        </div>

        <div class="phone-login-field" id="pl-sms-field">
          <label class="phone-login-label">验证码</label>
          <div class="phone-login-code-wrap">
            <input class="phone-login-input" id="pl-sms-code" type="text" placeholder="请输入验证码" maxlength="6" autocomplete="one-time-code" />
            <button class="phone-login-send-btn" id="pl-send-btn">获取验证码</button>
          </div>
        </div>

        <div class="phone-login-field" id="pl-password-field" style="display:none">
          <label class="phone-login-label">密码</label>
          <input class="phone-login-input" id="pl-password" type="password" placeholder="请输入密码" autocomplete="current-password" />
        </div>

        <div class="phone-login-error" id="pl-error"></div>

        <button class="phone-login-submit" id="pl-submit">登录</button>
      </div>
    </div>
  `

  const style = document.createElement('style')
  style.textContent = `
    .phone-login-card { width: 380px; max-width: 92vw; background: #fff; border-radius: 20px; padding: 40px 32px 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04); }
    .phone-login-header { text-align: center; margin-bottom: 24px; }
    .phone-login-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .phone-login-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0 0 4px; letter-spacing: -0.5px; }
    .phone-login-subtitle { font-size: 13px; color: #71717a; margin: 0; }
    .phone-login-tabs { display: flex; gap: 0; margin-bottom: 24px; background: #f4f4f5; border-radius: 10px; padding: 3px; }
    .phone-login-tab { flex: 1; padding: 8px 0; border: none; background: transparent; border-radius: 8px; font-size: 13px; font-weight: 600; color: #71717a; cursor: pointer; transition: all 0.2s; }
    .phone-login-tab.active { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .phone-login-form { display: flex; flex-direction: column; gap: 16px; }
    .phone-login-field { display: flex; flex-direction: column; gap: 6px; }
    .phone-login-label { font-size: 12px; font-weight: 700; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.5px; }
    .phone-login-input { width: 100%; height: 44px; padding: 0 14px; border: 1.5px solid #e4e4e7; border-radius: 10px; font-size: 15px; color: #18181b; outline: none; transition: border-color 0.2s; box-sizing: border-box; background: #fafafa; }
    .phone-login-input:focus { border-color: #6366f1; background: #fff; }
    .phone-login-phone-wrap { display: flex; gap: 0; }
    .phone-login-prefix { display: flex; align-items: center; padding: 0 12px; background: #f4f4f5; border: 1.5px solid #e4e4e7; border-right: none; border-radius: 10px 0 0 10px; font-size: 14px; font-weight: 600; color: #52525b; white-space: nowrap; }
    .phone-login-phone-wrap .phone-login-input { border-radius: 0 10px 10px 0; }
    .phone-login-code-wrap { display: flex; gap: 10px; }
    .phone-login-code-wrap .phone-login-input { flex: 1; }
    .phone-login-send-btn { flex-shrink: 0; height: 44px; padding: 0 16px; border: none; border-radius: 10px; background: #6366f1; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .phone-login-send-btn:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .phone-login-send-btn:not(:disabled):hover { background: #4f46e5; }
    .phone-login-send-btn:not(:disabled):active { transform: scale(0.97); }
    .phone-login-submit { width: 100%; height: 48px; border: none; border-radius: 12px; background: #18181b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    .phone-login-submit:hover { background: #27272a; }
    .phone-login-submit:active { transform: scale(0.98); }
    .phone-login-submit:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .phone-login-error { font-size: 13px; color: #ef4444; text-align: center; min-height: 20px; font-weight: 500; }
  `
  page.appendChild(style)

  // --- Logic ---
  const phoneInput = page.querySelector('#pl-phone')
  const smsCodeInput = page.querySelector('#pl-sms-code')
  const passwordInput = page.querySelector('#pl-password')
  const smsField = page.querySelector('#pl-sms-field')
  const passwordField = page.querySelector('#pl-password-field')
  const sendBtn = page.querySelector('#pl-send-btn')
  const submitBtn = page.querySelector('#pl-submit')
  const errorEl = page.querySelector('#pl-error')
  const tabBtns = page.querySelectorAll('.phone-login-tab')

  let currentTab = 'sms'
  let countdownTimer = null

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentTab = btn.dataset.tab
      smsField.style.display = currentTab === 'sms' ? '' : 'none'
      passwordField.style.display = currentTab === 'password' ? '' : 'none'
      errorEl.textContent = ''
    })
  })

  sendBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      errorEl.textContent = '请输入正确的手机号'
      return
    }
    errorEl.textContent = ''
    sendBtn.disabled = true
    sendBtn.textContent = '发送中...'

    try {
      const result = await api.sendSmsCode(phone)
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

  submitBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      errorEl.textContent = '请输入正确的手机号'
      return
    }
    errorEl.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = '登录中...'

    try {
      let result
      if (currentTab === 'sms') {
        const code = smsCodeInput.value.trim()
        if (!code) {
          errorEl.textContent = '请输入验证码'
          submitBtn.disabled = false
          submitBtn.textContent = '登录'
          return
        }
        result = await api.smsLogin(phone, code, hwfp)
      } else {
        const password = passwordInput.value
        if (!password) {
          errorEl.textContent = '请输入密码'
          submitBtn.disabled = false
          submitBtn.textContent = '登录'
          return
        }
        result = await api.passwordLogin(phone, password, hwfp)
      }

      if (!result.success) {
        errorEl.textContent = result.message || '登录失败'
        submitBtn.disabled = false
        submitBtn.textContent = '登录'
        return
      }

      const payload = {
        token: result.token,
        userId: result.userId,
        phone: phone,
        nickname: result.username || '',
      }

      if (result.isNewUser) {
        payload.needsCompleteInfo = true
        sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
        navigate('/complete-info')
      } else {
        sessionStorage.setItem('agent_planet_login_payload', JSON.stringify(payload))
        navigate('/login-callback')
      }
    } catch (err) {
      errorEl.textContent = err.message || '网络错误，请稍后重试'
      submitBtn.disabled = false
      submitBtn.textContent = '登录'
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

  setTimeout(() => phoneInput.focus(), 100)

  return page
}
