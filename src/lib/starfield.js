/**
 * 赛博朋克星空粒子动画
 * Canvas 叠加层：静态星点闪烁 + 随机流星划过
 * 仅在 data-theme="cyberpunk" 时激活
 */

let _canvas = null
let _ctx = null
let _rafId = null
let _stars = []
let _meteors = []
let _meteorTimer = null
let _running = false

const STAR_COUNT = 200
const METEOR_INTERVAL_MIN = 3000
const METEOR_INTERVAL_MAX = 8000

function _resize() {
  if (!_canvas) return
  _canvas.width = window.innerWidth
  _canvas.height = window.innerHeight
}

function _createStars() {
  _stars = []
  for (let i = 0; i < STAR_COUNT; i++) {
    _stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 1.5 + 0.5,
      opacity: Math.random(),
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinklePhase: Math.random() * Math.PI * 2
    })
  }
}

function _spawnMeteor() {
  _meteors.push({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight * 0.3,
    angle: Math.PI / 4 + (Math.random() - 0.5) * 0.5,
    length: 100 + Math.random() * 150,
    speed: 300 + Math.random() * 400,
    birthTime: performance.now(),
    duration: 1500
  })
}

function _scheduleMeteor() {
  const delay = METEOR_INTERVAL_MIN + Math.random() * (METEOR_INTERVAL_MAX - METEOR_INTERVAL_MIN)
  _meteorTimer = setTimeout(() => {
    _spawnMeteor()
    _scheduleMeteor()
  }, delay)
}

function _render(timestamp) {
  if (!_running) return
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height)

  // Static stars with twinkling
  for (const star of _stars) {
    star.twinklePhase += star.twinkleSpeed
    const alpha = star.opacity * (0.5 + 0.5 * Math.sin(star.twinklePhase))
    _ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
    _ctx.beginPath()
    _ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
    _ctx.fill()
  }

  // Meteors
  const now = performance.now()
  _meteors = _meteors.filter(m => {
    const elapsed = now - m.birthTime
    if (elapsed > m.duration) return false
    const progress = elapsed / m.duration
    const alpha = 1 - progress
    const currentX = m.x + Math.cos(m.angle) * m.speed * (elapsed / 1000)
    const currentY = m.y + Math.sin(m.angle) * m.speed * (elapsed / 1000)
    const trailX = currentX - Math.cos(m.angle) * m.length * (1 - progress * 0.5)
    const trailY = currentY - Math.sin(m.angle) * m.length * (1 - progress * 0.5)

    const gradient = _ctx.createLinearGradient(currentX, currentY, trailX, trailY)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    gradient.addColorStop(0.4, `rgba(0, 229, 255, ${alpha * 0.6})`)
    gradient.addColorStop(1, 'rgba(0, 229, 255, 0)')

    _ctx.strokeStyle = gradient
    _ctx.lineWidth = 1.5
    _ctx.beginPath()
    _ctx.moveTo(currentX, currentY)
    _ctx.lineTo(trailX, trailY)
    _ctx.stroke()
    return true
  })

  _rafId = requestAnimationFrame(_render)
}

export function startStarfield() {
  if (_running) return
  _running = true

  if (!_canvas) {
    _canvas = document.createElement('canvas')
    _canvas.id = 'starfield-canvas'
    _canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;'
    document.body.appendChild(_canvas)
    _ctx = _canvas.getContext('2d')
    window.addEventListener('resize', _resize)
  }

  _resize()
  _createStars()
  _scheduleMeteor()
  _rafId = requestAnimationFrame(_render)
}

export function stopStarfield() {
  _running = false
  if (_rafId) {
    cancelAnimationFrame(_rafId)
    _rafId = null
  }
  if (_meteorTimer) {
    clearTimeout(_meteorTimer)
    _meteorTimer = null
  }
  _stars = []
  _meteors = []
}

export function isStarfieldRunning() {
  return _running
}
