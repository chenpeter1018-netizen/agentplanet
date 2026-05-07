/**
 * 关于页面
 */
import { t } from '../lib/i18n.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="config-section" style="color:var(--text-secondary);font-size:var(--font-size-sm);line-height:2">
      <p>${t('about.techStack')}</p>
      <p style="margin-top:12px;color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('about.copyright')}</p>
    </div>
  `

  return page
}
