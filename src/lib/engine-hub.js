/**
 * Agent Planet 引擎管理器
 * 管理多引擎（OpenClaw / Hermes / ZeroClaw）的注册、切换和状态
 */
import { bridge, invalidate } from './backend-bridge.js'
import { registerRoute, setDefaultRoute } from '../router.js'

const _engines = {}
let _activeEngine = null
let _listeners = []

export function registerEngine(engine) {
  _engines[engine.id] = engine
}

export function listEngines() {
  return Object.values(_engines).map(e => ({
    id: e.id,
    name: e.name,
    icon: e.icon || '',
    description: e.description || '',
  }))
}

export function getActiveEngine() { return _activeEngine }
export function getActiveEngineId() { return _activeEngine?.id || 'openclaw' }

export function getEngine(id) {
  return _engines[id] || null
}

export function onEngineChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

/** 初始化引擎管理器：读取 agentplanet.json 中的 engineMode */
export async function initEngineHub() {
  let mode = 'openclaw'
  try {
    const cfg = await bridge.readPanelConfig()
    if (cfg?.engineMode && _engines[cfg.engineMode]) {
      mode = cfg.engineMode
    }
  } catch {}
  await activateEngine(mode, false)
}

/** 激活指定引擎 */
export async function activateEngine(id, persist = true) {
  const engine = _engines[id]
  if (!engine) {
    console.error(`[engine-hub] 未知引擎: ${id}`)
    return
  }

  if (_activeEngine && _activeEngine.id !== id) {
    if (_activeEngine.cleanup) {
      try { _activeEngine.cleanup() } catch {}
    }
    try { invalidate() } catch {}
  }

  _activeEngine = engine

  try { document.body.dataset.activeEngine = engine.id } catch {}

  const routes = engine.getRoutes()
  for (const r of routes) {
    registerRoute(r.path, r.loader)
  }
  if (engine.getDefaultRoute) {
    setDefaultRoute(engine.getDefaultRoute())
  }

  if (persist && engine.boot) {
    try {
      await Promise.race([
        engine.boot(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('engine boot timeout')), 10000))
      ])
    } catch (e) {
      console.warn('[engine-hub] boot 失败或超时:', e)
    }
  }

  if (persist) {
    try {
      const cfg = await bridge.readPanelConfig()
      if (cfg.engineMode !== id) {
        cfg.engineMode = id
        await bridge.writePanelConfig(cfg)
      }
    } catch (e) {
      console.warn('[engine-hub] 保存 engineMode 失败:', e)
    }
  }

  _listeners.forEach(fn => { try { fn(engine) } catch {} })
}

/** 切换引擎 */
export async function switchEngine(id) {
  if (_activeEngine?.id === id) return
  await activateEngine(id, true)
}
