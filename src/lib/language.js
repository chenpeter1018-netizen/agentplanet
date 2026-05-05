/**
 * Agent Planet i18n 国际化核心模块
 * 支持 zh-CN / en，点分隔路径 + 插值
 */
import { buildLocales } from '../locales/index.js'

const LANGS = buildLocales()
const LANG_KEY = 'agentplanet_lang'
const FALLBACK = 'zh-CN'

let _lang = FALLBACK
let _dict = LANGS[FALLBACK]
let _listeners = []

/**
 * 翻译函数 tl()（原 Agent Planet 的 t()）
 * @param {string} key - 点分隔路径，如 'sidebar.dashboard'
 * @param {object} [params] - 插值参数，如 { count: 3 }
 * @returns {string}
 */
export function tl(key, params) {
  let val = _resolve(_dict, key)
  if (val === undefined) {
    val = _resolve(LANGS[FALLBACK], key)
  }
  if (val === undefined) return key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return val
}

function _resolve(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

export function getLang() { return _lang }

export function getAvailableLangs() {
  return [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'en', label: 'English' },
  ]
}

export function setLang(lang) {
  if (!LANGS[lang]) return
  _lang = lang
  _dict = LANGS[lang]
  localStorage.setItem(LANG_KEY, lang)
  _listeners.forEach(fn => { try { fn(lang) } catch {} })
}

export function onLangChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

export function initLanguage() {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved && LANGS[saved]) {
    _lang = saved
    _dict = LANGS[saved]
    return
  }
  const nav = navigator.language || navigator.languages?.[0] || ''
  if (nav.startsWith('zh')) {
    _lang = 'zh-CN'
  } else if (nav.startsWith('en')) {
    _lang = 'en'
  }
  _dict = LANGS[_lang] || LANGS[FALLBACK]

  if (typeof window !== 'undefined') {
    window.addEventListener('agentplanet-lang-change', (e) => {
      const next = e?.detail
      if (next && LANGS[next] && next !== _lang) setLang(next)
    })
  }
}
