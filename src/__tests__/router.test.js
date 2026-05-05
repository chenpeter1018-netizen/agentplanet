import { describe, it, expect, beforeEach, vi } from 'vitest'

let router

beforeEach(async () => {
  // 设置 hash 模拟
  window.location.hash = '#/dashboard'
  // 重新导入
  router = await import('../router.js')
})

describe('router', () => {
  describe('registerRoute / navigate', () => {
    it('registerRoute 注册路由', () => {
      const loader = vi.fn()
      router.registerRoute('/test', loader)
      router.navigate('/test')
      expect(window.location.hash).toBe('#/test')
    })
  })

  describe('setDefaultRoute', () => {
    it('设置默认路由', () => {
      router.setDefaultRoute('/home')
      // getCurrentRoute 在 hash 存在时返回 hash
      window.location.hash = ''
      expect(router.getCurrentRoute()).toBe('/home')
    })
  })

  describe('getCurrentRoute', () => {
    it('返回当前 hash 路由', () => {
      window.location.hash = '#/settings/about'
      expect(router.getCurrentRoute()).toBe('/settings/about')
    })

    it('空 hash 返回默认路由', () => {
      window.location.hash = ''
      router.setDefaultRoute('/fallback')
      expect(router.getCurrentRoute()).toBe('/fallback')
    })
  })
})
