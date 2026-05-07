/**
 * i18n 辅助函数 — 仅支持 zh-CN / en
 */
export const SUPPORTED_LANGS = ['zh-CN', 'en']

export function _(zhCN, en, ..._rest) {
  return { 'zh-CN': zhCN, en }
}
