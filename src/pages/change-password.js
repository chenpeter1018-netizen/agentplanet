/**
 * 修改登录密码 — 原生 UI，通过云函数代理调用妙搭 OpenAPI
 */
import { api } from '../lib/tauri-api.js'
import { navigate } from '../router.js'
import { toast } from '../components/toast.js'

function strengthLevel(pw) {
  if (!pw || pw.length < 6) return { level: 1, text: '至少6位' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { level: 2, text: '较弱', color: '#f59e0b' }
  if (score <= 3) return { level: 3, text: '中等', color: '#6366f1' }
  return { level: 4, text: '强', color: '#10b981' }
}

export async function render() {
  const stored = sessionStorage.getItem('agent_planet_login_payload')
  let token = ''
  if (stored) {
    try { token = JSON.parse(stored).token || '' } catch (_) {}
  }

  const page = document.createElement('div')
  page.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif'

  page.innerHTML = `
    <div class="cp-card">
      <div class="cp-header">
        <div class="cp-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h1 class="cp-title">修改登录密码</h1>
        <p class="cp-subtitle">更改您在妙搭平台的登录密码</p>
      </div>

      <div class="cp-form">
        <div class="cp-field">
          <label class="cp-label">旧密码</label>
          <input class="cp-input" id="cp-old-pw" type="password" placeholder="请输入旧密码" autocomplete="current-password" />
        </div>

        <div class="cp-field">
          <label class="cp-label">新密码</label>
          <input class="cp-input" id="cp-new-pw" type="password" placeholder="请输入新密码（至少6位）" autocomplete="new-password" />
          <div id="cp-strength" style="margin-top:6px;display:flex;align-items:center;gap:8px;min-height:20px"></div>
        </div>

        <div class="cp-field">
          <label class="cp-label">确认新密码</label>
          <input class="cp-input" id="cp-confirm-pw" type="password" placeholder="请再次输入新密码" autocomplete="new-password" />
        </div>

        <div class="cp-error" id="cp-error"></div>

        <button class="cp-submit" id="cp-submit">确认修改</button>
        <button class="cp-back" id="cp-back">返回</button>
      </div>
    </div>
  `

  const style = document.createElement('style')
  style.textContent = `
    .cp-card { width: 380px; max-width: 92vw; background: #fff; border-radius: 20px; padding: 40px 32px 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04); }
    .cp-header { text-align: center; margin-bottom: 24px; }
    .cp-icon { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .cp-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0 0 4px; letter-spacing: -0.5px; }
    .cp-subtitle { font-size: 13px; color: #71717a; margin: 0; }
    .cp-form { display: flex; flex-direction: column; gap: 16px; }
    .cp-field { display: flex; flex-direction: column; gap: 6px; }
    .cp-label { font-size: 12px; font-weight: 700; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.5px; }
    .cp-input { width: 100%; height: 44px; padding: 0 14px; border: 1.5px solid #e4e4e7; border-radius: 10px; font-size: 15px; color: #18181b; outline: none; transition: border-color 0.2s; box-sizing: border-box; background: #fafafa; }
    .cp-input:focus { border-color: #6366f1; background: #fff; }
    .cp-submit { width: 100%; height: 48px; border: none; border-radius: 12px; background: #18181b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 4px; }
    .cp-submit:hover { background: #27272a; }
    .cp-submit:active { transform: scale(0.98); }
    .cp-submit:disabled { background: #d4d4d8; color: #a1a1aa; cursor: not-allowed; }
    .cp-back { width: 100%; height: 40px; border: none; background: transparent; color: #71717a; font-size: 13px; font-weight: 600; cursor: pointer; }
    .cp-back:hover { color: #3f3f46; }
    .cp-error { font-size: 13px; color: #ef4444; text-align: center; min-height: 20px; font-weight: 500; }
  `
  page.appendChild(style)

  const oldPwEl = page.querySelector('#cp-old-pw')
  const newPwEl = page.querySelector('#cp-new-pw')
  const confirmPwEl = page.querySelector('#cp-confirm-pw')
  const strengthEl = page.querySelector('#cp-strength')
  const submitBtn = page.querySelector('#cp-submit')
  const backBtn = page.querySelector('#cp-back')
  const errorEl = page.querySelector('#cp-error')

  newPwEl.addEventListener('input', () => {
    const s = strengthLevel(newPwEl.value)
    if (!newPwEl.value) { strengthEl.innerHTML = ''; return }
    const bars = [1,2,3,4].map(i =>
      `<div style="width:32px;height:4px;border-radius:2px;background:${i <= s.level ? (s.color || '#6366f1') : '#e4e4e7'}"></div>`
    ).join('')
    strengthEl.innerHTML = `${bars}<span style="font-size:11px;color:${s.color || '#6366f1'};font-weight:500">${s.text}</span>`
  })

  backBtn.addEventListener('click', () => history.back())

  submitBtn.addEventListener('click', async () => {
    const oldPw = oldPwEl.value
    const newPw = newPwEl.value
    const confirmPw = confirmPwEl.value

    if (!oldPw) { errorEl.textContent = '请输入旧密码'; return }
    if (!newPw || newPw.length < 6) { errorEl.textContent = '新密码至少6位'; return }
    if (newPw !== confirmPw) { errorEl.textContent = '两次新密码输入不一致'; return }
    if (newPw === oldPw) { errorEl.textContent = '新密码不能与旧密码相同'; return }
    if (!token) { errorEl.textContent = '登录已过期，请重新登录'; return }

    errorEl.textContent = ''
    submitBtn.disabled = true
    submitBtn.textContent = '提交中...'

    try {
      const result = await api.changePassword(token, oldPw, newPw)
      if (!result.success) {
        errorEl.textContent = result.message || '修改失败'
        submitBtn.disabled = false
        submitBtn.textContent = '确认修改'
        return
      }
      toast('密码修改成功', 'success')
      history.back()
    } catch (err) {
      errorEl.textContent = err.message || '网络错误，请稍后重试'
      submitBtn.disabled = false
      submitBtn.textContent = '确认修改'
    }
  })

  page.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click()
  })

  const cleanup = () => page.remove()
  page._destroy = cleanup

  setTimeout(() => oldPwEl.focus(), 100)

  return page
}
