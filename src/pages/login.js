/**
 * Agent Planet 登录页（从 React 移植为 Vanilla JS）
 * CoverScreen: Canvas 粒子拖尾 + Web Audio API 音效
 * NeuralBackground: Canvas 神经节点 + 鼠标交互
 * 登录表单: "AGENT PLANET" 霓虹品牌字 + 密码输入 + Initialize 按钮
 */
import { tl } from '../lib/language.js'
import { bridge, isTauriRuntime } from '../lib/backend-bridge.js'
import { navigate } from '../router.js'
import { getActiveEngine } from '../lib/engine-hub.js'

const FADE_MS = 2400
let _el = null
let _coverDismissed = false
let _neuralFrame = null
let _particles = []
let _particleRaf = 0

export async function render() {
  _el = document.createElement('div')
  _el.className = 'login-root'
  _el.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:var(--bg-primary);font-family:var(--font-sans)'

  _el.innerHTML = `
    <canvas id="neural-bg" style="position:fixed;inset:0;z-index:0;pointer-events:none" aria-hidden="true"></canvas>
    <div style="position:absolute;left:-160px;top:25%;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle, var(--nebula-cyan, #22D3EE) 0%, transparent 70%);opacity:0.15;filter:blur(40px);pointer-events:none;animation:login-float-orb 18s ease-in-out infinite" aria-hidden="true"></div>
    <div style="position:absolute;right:-160px;bottom:25%;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle, var(--nebula-purple, #A855F7) 0%, transparent 70%);opacity:0.2;filter:blur(40px);pointer-events:none;animation:login-float-orb 22s ease-in-out infinite reverse" aria-hidden="true"></div>

    <div style="position:absolute;inset-x:0;bottom:0;height:60vh;overflow:hidden;opacity:0.4;pointer-events:none" aria-hidden="true">
      <div style="position:absolute;inset:0;background-image:linear-gradient(hsla(190,100%,70%,.12) 1px,transparent 1px),linear-gradient(90deg,hsla(190,100%,70%,.12) 1px,transparent 1px);background-size:60px 60px;transform:perspective(500px) rotateX(60deg);transform-origin:center top;animation:login-grid-move 20s linear infinite"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(to top, var(--bg-primary) 0%, transparent 90%)"></div>
    </div>

    <div style="position:absolute;inset-x:0;top:0;z-index:10;height:1px;opacity:0.5;background:linear-gradient(90deg,transparent,var(--nebula-cyan, #22D3EE),transparent);box-shadow:0 0 20px var(--nebula-cyan, #22D3EE);pointer-events:none;animation:login-scan-line 8s linear infinite" aria-hidden="true"></div>

    <div style="position:relative;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:48px;font-size:11px;text-transform:uppercase;letter-spacing:.4em;color:var(--text-tertiary);animation:login-fade-up .8s ease-out">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);animation:login-pulse-glow 2s ease-in-out infinite"></span>
        Neural Memory Interface
        <span style="width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);animation:login-pulse-glow 2s ease-in-out infinite"></span>
      </div>

      <h1 style="font-size:clamp(40px,8vw,80px);font-weight:900;letter-spacing:.2em;margin-bottom:12px;text-align:center;background:linear-gradient(135deg,var(--nebula-cyan, #22D3EE),var(--nebula-purple, #A855F7) 50%,var(--nebula-pink, #F472B6));-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 40px var(--nebula-cyan, #22D3EE);animation:login-fade-up 1s ease-out .1s backwards">AGENT PLANET</h1>

      <p style="font-size:13px;font-weight:300;letter-spacing:.3em;color:var(--text-tertiary);margin-bottom:48px;text-align:center;animation:login-fade-up 1s ease-out .25s backwards">ACCESS · YOUR · MEMORY · CORE</p>

      <form id="login-form-main" style="position:relative;width:100%;max-width:420px;background:hsla(230,30%,10%,.4);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid hsla(190,100%,70%,.15);border-radius:24px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,.6),inset 0 1px 0 hsla(190,100%,90%,.08);animation:login-fade-up 1s ease-out .4s backwards">
        <span style="position:absolute;left:0;top:0;width:20px;height:20px;border-left:2px solid var(--nebula-cyan, #22D3EE);border-top:2px solid var(--nebula-cyan, #22D3EE);border-radius:24px 0 0 0"></span>
        <span style="position:absolute;right:0;top:0;width:20px;height:20px;border-right:2px solid var(--nebula-pink, #F472B6);border-top:2px solid var(--nebula-pink, #F472B6);border-radius:0 24px 0 0"></span>
        <span style="position:absolute;bottom:0;left:0;width:20px;height:20px;border-bottom:2px solid var(--nebula-purple, #A855F7);border-left:2px solid var(--nebula-purple, #A855F7);border-radius:0 0 0 24px"></span>
        <span style="position:absolute;bottom:0;right:0;width:20px;height:20px;border-bottom:2px solid var(--nebula-cyan, #22D3EE);border-right:2px solid var(--nebula-cyan, #22D3EE);border-radius:0 0 24px 0"></span>

        <label for="login-password" style="display:flex;align-items:center;gap:8px;font-size:11px;text-transform:uppercase;letter-spacing:.3em;color:var(--text-tertiary);margin-bottom:12px">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Cipher Key
        </label>

        <div style="position:relative">
          <input id="login-password" type="password" placeholder="·  ·  ·  ·  ·  ·  ·  ·" autocomplete="current-password" autofocus
            style="width:100%;padding:14px 44px 14px 18px;border-radius:12px;border:1px solid hsla(190,60%,40%,.4);background:hsla(230,30%,12%,.6);color:var(--text-primary);font-size:18px;letter-spacing:.3em;outline:none;transition:all .3s;box-sizing:border-box" />
          <button type="button" id="login-toggle-pw" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-tertiary);cursor:pointer;padding:4px" aria-label="Show password">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>

        <button type="submit" id="login-submit-btn" style="position:relative;width:100%;margin-top:24px;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--nebula-cyan, #22D3EE),var(--nebula-purple, #A855F7));color:#0a0a1a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.3em;cursor:pointer;overflow:hidden;transition:all .3s">
          <span id="login-btn-shine" style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,hsla(320,100%,65%,.4),transparent);transform:translateX(-100%);transition:transform .7s"></span>
          <span style="position:relative;display:flex;align-items:center;justify-content:center;gap:8px">Initialize <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg></span>
        </button>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;font-size:10px;text-transform:uppercase;letter-spacing:.25em;color:var(--text-tertiary)">
          <span style="display:flex;align-items:center;gap:8px"><span style="width:4px;height:4px;border-radius:50%;background:var(--nebula-purple, #A855F7);animation:login-pulse-glow 2s ease-in-out infinite"></span>Encrypted · 256bit</span>
          <span>v1.0.0</span>
        </div>
        <div id="login-error-msg" style="margin-top:10px;font-size:12px;color:var(--error);min-height:16px;text-align:center"></div>
      </form>

      <div style="margin-top:48px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.4em;color:var(--text-tertiary);opacity:.6;animation:login-fade-up 1s ease-out .6s backwards">v2.0.4 · Synaptic Build · Agent Planet Systems</div>
    </div>

    <div style="position:absolute;inset:0;z-index:10;pointer-events:none;background:radial-gradient(ellipse at center, transparent 40%, var(--bg-primary) 100%)" aria-hidden="true"></div>
  `

  addLoginStyles()
  setTimeout(() => startNeuralBackground(), 100)
  bindLoginEvents(_el)

  if (!_coverDismissed) renderCoverScreen()

  return _el
}

function addLoginStyles() {
  if (document.getElementById('login-anim-styles')) return
  const style = document.createElement('style')
  style.id = 'login-anim-styles'
  style.textContent = `
    @keyframes login-float-orb { 0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-40px) scale(1.1)}66%{transform:translate(-30px,30px) scale(.9)} }
    @keyframes login-pulse-glow { 0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)} }
    @keyframes login-scan-line { 0%{transform:translateY(-100%)}100%{transform:translateY(100vh)} }
    @keyframes login-grid-move { 0%{background-position:0 0}100%{background-position:0 60px} }
    @keyframes login-fade-up { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
  `
  document.head.appendChild(style)
}

// === CoverScreen ===
function renderCoverScreen() {
  const overlay = document.createElement('div')
  overlay.id = 'cover-screen'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:var(--bg-primary);transition:opacity 2400ms cubic-bezier(.4,0,.2,1),filter 2400ms ease-out,transform 2400ms ease-out'

  const img = document.createElement('img')
  img.src = '/images/cover.png'
  img.alt = 'AGENT PLANET'
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;animation:login-fade-up 1.4s ease-out'
  img.onerror = () => { img.style.display = 'none' }
  overlay.appendChild(img)

  const hint = document.createElement('div')
  hint.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);font-size:11px;text-transform:uppercase;letter-spacing:.5em;color:rgba(255,255,255,.8);pointer-events:none'
  hint.textContent = '◂  Move · Click to Enter  ▸'
  overlay.appendChild(hint)

  const vignette = document.createElement('div')
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, transparent 50%, var(--bg-primary) 100%)'
  overlay.appendChild(vignette)

  const particleCanvas = document.createElement('canvas')
  particleCanvas.id = 'cover-particles'
  particleCanvas.style.cssText = 'position:fixed;inset:0;z-index:101;pointer-events:none;display:none'
  overlay.appendChild(particleCanvas)

  document.body.appendChild(overlay)

  let dismissed = false
  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    _coverDismissed = true

    startParticleTrail(particleCanvas)
    playWarpSound()

    overlay.style.opacity = '0'
    overlay.style.filter = 'blur(20px) brightness(0.4)'
    overlay.style.transform = 'scale(1.08)'
    overlay.style.pointerEvents = 'none'

    setTimeout(() => {
      overlay.remove()
      stopParticleTrail()
    }, FADE_MS)
  }

  setTimeout(() => {
    window.addEventListener('click', dismiss, { once: true })
    window.addEventListener('keydown', dismiss, { once: true })
    let moves = 0
    const onMove = () => { moves++; if (moves > 8) { window.removeEventListener('mousemove', onMove); dismiss() } }
    window.addEventListener('mousemove', onMove)
  }, 800)
}

// === Particle Trail ===
function startParticleTrail(canvas) {
  canvas.style.display = 'block'
  canvas.width = window.innerWidth; canvas.height = window.innerHeight
  const ctx = canvas.getContext('2d')
  const start = performance.now()

  function spawn() {
    const cx = canvas.width / 2, cy = canvas.height / 2
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2, speed = Math.random() * 6 + 2
      _particles.push({ x: cx + (Math.random() - 0.5) * canvas.width * 0.8, y: cy + (Math.random() - 0.5) * canvas.height * 0.8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, maxLife: 60 + Math.random() * 40, size: Math.random() * 2.5 + 0.5, hue: Math.random() < 0.5 ? 180 : Math.random() < 0.5 ? 270 : 320 })
    }
  }

  function tick(t) {
    const elapsed = t - start
    ctx.fillStyle = 'hsla(230, 35%, 4%, 0.18)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (elapsed < FADE_MS - 300) spawn()
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i]; p.life++; p.x += p.vx; p.y += p.vy; p.vx *= 0.98; p.vy *= 0.98
      const alpha = 1 - p.life / p.maxLife
      if (alpha <= 0) { _particles.splice(i, 1); continue }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`; ctx.shadowBlur = 16; ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha})`; ctx.fill()
    }
    ctx.shadowBlur = 0
    if (elapsed < FADE_MS + 400) _particleRaf = requestAnimationFrame(tick)
  }
  _particleRaf = requestAnimationFrame(tick)
}

function stopParticleTrail() {
  if (_particleRaf) { cancelAnimationFrame(_particleRaf); _particleRaf = 0 }
  _particles = []
}

// === Warp Sound (Web Audio API) ===
function playWarpSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx(); const now = ctx.currentTime; const duration = 2.2
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now); master.gain.exponentialRampToValueAtTime(0.35, now + 0.15); master.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    master.connect(ctx.destination)

    const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(180, now); osc1.frequency.exponentialRampToValueAtTime(1800, now + 1.4)
    const g1 = ctx.createGain(); g1.gain.value = 0.4; osc1.connect(g1).connect(master); osc1.start(now); osc1.stop(now + duration)

    const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(220, now); osc2.frequency.exponentialRampToValueAtTime(40, now + 1.6)
    const g2 = ctx.createGain(); g2.gain.value = 0.18; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
    osc2.connect(lp).connect(g2).connect(master); osc2.start(now); osc2.stop(now + duration)

    const bufferSize = ctx.sampleRate * duration; const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, now); bp.frequency.exponentialRampToValueAtTime(6000, now + 1.2); bp.Q.value = 0.9
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(0.25, now + 0.25); gn.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    noise.connect(bp).connect(gn).connect(master); noise.start(now); noise.stop(now + duration)

    setTimeout(() => ctx.close(), (duration + 0.3) * 1000)
  } catch {}
}

// === Neural Background Canvas ===
function startNeuralBackground() {
  const canvas = document.getElementById('neural-bg')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  let nodes = []

  function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight
    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 18000))
    nodes = Array.from({ length: count }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, radius: Math.random() * 1.8 + 0.6 }))
  }

  const mouse = { x: -1000, y: -1000 }
  const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY }

  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onMove)

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy
      if (n.x < 0 || n.x > canvas.width) n.vx *= -1
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      ctx.fillStyle = 'hsla(180, 100%, 70%, 0.8)'; ctx.shadowBlur = 12; ctx.shadowColor = 'hsla(180, 100%, 60%, 0.9)'; ctx.fill()
    })
    ctx.shadowBlur = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 140) { const opacity = (1 - dist / 140) * 0.35; ctx.strokeStyle = `hsla(190, 100%, 65%, ${opacity})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke() }
      }
      const mdx = nodes[i].x - mouse.x, mdy = nodes[i].y - mouse.y, mdist = Math.sqrt(mdx * mdx + mdy * mdy)
      if (mdist < 200) { const opacity = (1 - mdist / 200) * 0.6; ctx.strokeStyle = `hsla(320, 100%, 70%, ${opacity})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke() }
    }
    _neuralFrame = requestAnimationFrame(draw)
  }
  draw()
}

// === 登录表单事件 ===
function bindLoginEvents(el) {
  const form = el.querySelector('#login-form-main')
  const pwInput = el.querySelector('#login-password')
  const toggleBtn = el.querySelector('#login-toggle-pw')
  const submitBtn = el.querySelector('#login-submit-btn')
  const errorEl = el.querySelector('#login-error-msg')
  const shineEl = el.querySelector('#login-btn-shine')

  let showPw = false
  toggleBtn.addEventListener('click', () => {
    showPw = !showPw
    pwInput.type = showPw ? 'text' : 'password'
    toggleBtn.innerHTML = showPw
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
  })

  submitBtn.addEventListener('mouseenter', () => { shineEl.style.transform = 'translateX(100%)' })
  submitBtn.addEventListener('mouseleave', () => { shineEl.style.transform = 'translateX(-100%)' })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const pw = pwInput.value
    if (!pw) return

    submitBtn.disabled = true
    submitBtn.querySelector('span').innerHTML = 'Authenticating…'
    errorEl.textContent = ''

    try {
      const isTauri = isTauriRuntime()
      if (isTauri) {
        const cfg = await bridge.readPanelConfig()
        if (pw !== cfg.accessPassword) {
          errorEl.textContent = tl('security.loginWrongPassword')
          submitBtn.disabled = false
          submitBtn.querySelector('span').innerHTML = 'Initialize <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>'
          return
        }
        sessionStorage.setItem('agentplanet_authed', '1')
      } else {
        const resp = await fetch('/__api/auth_login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        })
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}))
          errorEl.textContent = data.error || tl('security.loginFailed')
          submitBtn.disabled = false
          submitBtn.querySelector('span').innerHTML = 'Initialize <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>'
          return
        }
      }
      const engine = getActiveEngine()
      navigate(engine ? engine.getDefaultRoute() : '/dashboard')
    } catch (err) {
      errorEl.textContent = `${tl('common.networkError')}: ${err.message || err}`
      submitBtn.disabled = false
      submitBtn.querySelector('span').innerHTML = 'Initialize <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>'
    }
  })

  pwInput.addEventListener('focus', () => {
    pwInput.style.borderColor = 'var(--nebula-cyan, #22D3EE)'
    pwInput.style.boxShadow = '0 0 30px hsla(180,100%,60%,.4), inset 0 0 20px hsla(180,100%,60%,.05)'
  })
  pwInput.addEventListener('blur', () => {
    pwInput.style.borderColor = 'hsla(190,60%,40%,.4)'
    pwInput.style.boxShadow = 'none'
  })
}

export function cleanup() {
  if (_neuralFrame) { cancelAnimationFrame(_neuralFrame); _neuralFrame = null }
  stopParticleTrail()
  _el = null
}
