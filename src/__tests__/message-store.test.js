import { describe, it, expect, beforeEach, vi } from 'vitest'

// vitest 会自动提升 vi.mock 到顶层，但这里不需要 mock

beforeEach(async () => {
  localStorage.clear()
  vi.resetModules()
})

describe('messageStore', () => {
  describe('addMessage / getMessages', () => {
    it('添加消息后可以用 getMessages 读取', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: 'Hello' })
      const msgs = store.getMessages('conv-1')
      expect(msgs.length).toBe(1)
      expect(msgs[0].content).toBe('Hello')
      expect(msgs[0].conversationId).toBe('conv-1')
      expect(msgs[0].id).toBeTruthy()
    })

    it('getMessages 支持分页', async () => {
      const store = await import('../lib/message-store.js')
      for (let i = 0; i < 10; i++) {
        store.addMessage('conv-1', { role: 'user', content: `msg-${i}` })
      }
      const page = store.getMessages('conv-1', { offset: 3, limit: 4 })
      expect(page.length).toBe(4)
      expect(page[0].content).toBe('msg-3')
      expect(page[3].content).toBe('msg-6')
    })

    it('getMessages 不传 limit 返回从 offset 开始全部', async () => {
      const store = await import('../lib/message-store.js')
      for (let i = 0; i < 5; i++) {
        store.addMessage('conv-1', { role: 'user', content: `msg-${i}` })
      }
      const result = store.getMessages('conv-1', { offset: 2 })
      expect(result.length).toBe(3)
    })
  })

  describe('getMessageCount', () => {
    it('统计指定会话消息数', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: 'a' })
      store.addMessage('conv-1', { role: 'assistant', content: 'b' })
      store.addMessage('conv-2', { role: 'user', content: 'c' })
      expect(store.getMessageCount('conv-1')).toBe(2)
      expect(store.getMessageCount('conv-2')).toBe(1)
      expect(store.getMessageCount('conv-none')).toBe(0)
    })
  })

  describe('searchMessages', () => {
    it('全文搜索匹配内容', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: '天气不错' })
      store.addMessage('conv-1', { role: 'assistant', content: '是的' })
      store.addMessage('conv-2', { role: 'user', content: '今天天气如何' })
      const results = store.searchMessages('天气', 'conv-1')
      expect(results.length).toBe(1)
      expect(results[0].content).toBe('天气不错')
    })

    it('不传 conversationId 搜索全部会话', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: '天气不错' })
      store.addMessage('conv-2', { role: 'user', content: '天气如何' })
      const results = store.searchMessages('天气')
      expect(results.length).toBe(2)
    })

    it('大小写不敏感', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: 'Hello World' })
      const results = store.searchMessages('hello')
      expect(results.length).toBe(1)
    })
  })

  describe('会话管理', () => {
    it('addConversation 添加新会话', async () => {
      const store = await import('../lib/message-store.js')
      store.addConversation({ id: 'c1', title: '测试会话' })
      const convs = store.getConversations()
      expect(convs.length).toBe(1)
      expect(convs[0].title).toBe('测试会话')
    })

    it('addConversation 更新已有会话', async () => {
      const store = await import('../lib/message-store.js')
      store.addConversation({ id: 'c1', title: '原始标题' })
      store.addConversation({ id: 'c1', title: '新标题' })
      const convs = store.getConversations()
      expect(convs.length).toBe(1)
      expect(convs[0].title).toBe('新标题')
    })

    it('deleteConversation 同时删除会话和消息', async () => {
      const store = await import('../lib/message-store.js')
      store.addConversation({ id: 'c1', title: '待删除' })
      store.addMessage('c1', { role: 'user', content: 'hello' })
      store.deleteConversation('c1')
      expect(store.getConversations().length).toBe(0)
      expect(store.getMessages('c1').length).toBe(0)
    })

    it('clearMessages 只清除指定会话的消息', async () => {
      const store = await import('../lib/message-store.js')
      store.addMessage('conv-1', { role: 'user', content: 'a' })
      store.addMessage('conv-2', { role: 'user', content: 'b' })
      store.clearMessages('conv-1')
      expect(store.getMessages('conv-1').length).toBe(0)
      expect(store.getMessages('conv-2').length).toBe(1)
    })
  })
})
