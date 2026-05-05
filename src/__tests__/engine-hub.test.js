import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.mock 必须在顶层，vitest 会自动提升
vi.mock('../lib/backend-bridge.js', () => ({
  bridge: { readPanelConfig: vi.fn().mockResolvedValue({ engineMode: 'openclaw' }), writePanelConfig: vi.fn().mockResolvedValue({}) },
  invalidate: vi.fn(),
}))
vi.mock('../router.js', () => ({
  registerRoute: vi.fn(),
  setDefaultRoute: vi.fn(),
}))

beforeEach(async () => {
  vi.resetModules()
})

describe('engineHub', () => {
  describe('registerEngine / getEngine', () => {
    it('注册后可以通过 getEngine 获取', async () => {
      const hub = await import('../lib/engine-hub.js')
      const engine = { id: 'hermes', name: 'Hermes', getRoutes: () => [] }
      hub.registerEngine(engine)
      expect(hub.getEngine('hermes')).toBe(engine)
    })

    it('未注册引擎返回 null', async () => {
      const hub = await import('../lib/engine-hub.js')
      expect(hub.getEngine('nonexistent')).toBeNull()
    })
  })

  describe('listEngines', () => {
    it('列出所有已注册引擎的摘要', async () => {
      const hub = await import('../lib/engine-hub.js')
      hub.registerEngine({
        id: 'openclaw', name: 'OpenClaw', icon: '🦞',
        description: '主引擎', getRoutes: () => []
      })
      hub.registerEngine({
        id: 'hermes', name: 'Hermes', icon: '⚡',
        description: 'Python 引擎', getRoutes: () => []
      })
      const list = hub.listEngines()
      expect(list.length).toBe(2)
      expect(list.find(e => e.id === 'openclaw')).toBeTruthy()
      expect(list.find(e => e.id === 'hermes')).toBeTruthy()
    })
  })

  describe('getActiveEngineId', () => {
    it('未激活时返回 openclaw', async () => {
      const hub = await import('../lib/engine-hub.js')
      expect(hub.getActiveEngineId()).toBe('openclaw')
    })

    it('激活后返回当前引擎 id', async () => {
      const hub = await import('../lib/engine-hub.js')
      hub.registerEngine({
        id: 'hermes', name: 'Hermes', getRoutes: () => []
      })
      await hub.activateEngine('hermes', false)
      expect(hub.getActiveEngineId()).toBe('hermes')
    })
  })

  describe('onEngineChange', () => {
    it('订阅和取消订阅', async () => {
      const hub = await import('../lib/engine-hub.js')
      hub.registerEngine({ id: 'hermes', name: 'Hermes', getRoutes: () => [] })
      hub.registerEngine({ id: 'openclaw', name: 'OpenClaw', getRoutes: () => [] })

      const fn = vi.fn()
      const unsub = hub.onEngineChange(fn)
      await hub.activateEngine('hermes', false)
      expect(fn).toHaveBeenCalledTimes(1)

      unsub()
      await hub.activateEngine('openclaw', false)
      // 取消订阅后不再触发
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
