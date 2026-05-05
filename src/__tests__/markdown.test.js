import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../lib/markdown.js'

describe('renderMarkdown', () => {
  it('空字符串返回空', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })

  it('渲染标题 h1/h2/h3', () => {
    expect(renderMarkdown('# 标题一')).toContain('<h1>标题一</h1>')
    expect(renderMarkdown('## 标题二')).toContain('<h2>标题二</h2>')
    expect(renderMarkdown('### 标题三')).toContain('<h3>标题三</h3>')
  })

  it('渲染粗体和斜体', () => {
    expect(renderMarkdown('**粗体**')).toContain('<strong>粗体</strong>')
    expect(renderMarkdown('*斜体*')).toContain('<em>斜体</em>')
  })

  it('渲染删除线', () => {
    const result = renderMarkdown('~~删除~~')
    expect(result).toContain('~~删除~~')
  })

  it('渲染行内代码', () => {
    expect(renderMarkdown('使用 `code` 标记')).toContain('<code>code</code>')
  })

  it('渲染代码块', () => {
    const result = renderMarkdown('```js\nconst a = 1\n```')
    expect(result).toContain('<pre data-lang="js"')
    expect(result).toContain('<code>')
    expect(result).toContain('hl-keyword')
    expect(result).toContain('hl-number')
  })

  it('渲染链接', () => {
    const result = renderMarkdown('[Google](https://google.com)')
    expect(result).toContain('<a href="https://google.com"')
    expect(result).toContain('>Google</a>')
  })

  it('渲染图片', () => {
    const result = renderMarkdown('![logo](img/logo.png)')
    expect(result).toContain('<img src="img/logo.png" alt="logo"')
  })

  it('渲染无序列表', () => {
    const result = renderMarkdown('- 项目A\n- 项目B\n- 项目C')
    expect(result).toContain('<ul>')
    expect(result.match(/<li>/g).length).toBe(3)
  })

  it('渲染有序列表', () => {
    const result = renderMarkdown('1. 第一\n2. 第二\n3. 第三')
    expect(result).toContain('<ol>')
    expect(result.match(/<li>/g).length).toBe(3)
  })

  it('渲染引用块', () => {
    const result = renderMarkdown('> 引用文本')
    expect(result).toContain('> 引用文本')
  })

  it('渲染分割线', () => {
    expect(renderMarkdown('---')).toContain('---')
  })

  it('渲染表格', () => {
    const result = renderMarkdown('| 列A | 列B |\n|------|------|\n| 值1 | 值2 |\n| 值3 | 值4 |')
    expect(result).toContain('<table>')
    expect(result).toContain('<th>列A</th>')
    expect(result).toContain('<th>列B</th>')
    expect(result).toContain('<td>值1</td>')
    expect(result).toContain('<td>值4</td>')
  })

  it('段落包裹', () => {
    const result = renderMarkdown('一行文字')
    expect(result).toContain('<p>')
  })

  it('转义 HTML', () => {
    const result = renderMarkdown('<script>alert(1)</script>')
    expect(result).toContain('alert(1)')
  })

  it('多段分割', () => {
    const result = renderMarkdown('段落1\n\n段落2')
    expect(result).toContain('段落1')
    expect(result).toContain('段落2')
  })
})
