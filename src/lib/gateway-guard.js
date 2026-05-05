/**
 * Agent Planet Gateway 归属权守卫
 * 检测 Gateway 是否属于外部实例，处理冲突
 */
import { bridge, isTauriRuntime } from './backend-bridge.js'
import { tl } from './language.js'
import { showModal } from '../components/modal.js'

export function isForeignGatewayError(err) {
  const msg = (err?.message || String(err)).toLowerCase()
  return /foreign|外部|归属|ownership|不属于|claim/i.test(msg)
}

export async function showGatewayConflictGuidance({ error, service } = {}) {
  const port = service?.port || 18789
  const errMsg = error?.message || String(error || '')

  showModal({
    title: tl('dashboard.foreignGatewayBanner'),
    content: `
      <div style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.8">
        <p>Gateway 端口 ${port} 检测到运行中的进程，但它属于另一个实例。</p>
        <p style="margin-top:8px">你可以选择认领此 Gateway（将当前配置写入该实例），或手动停止旧进程后重新启动。</p>
        ${errMsg ? `<p style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-tertiary)">${errMsg}</p>` : ''}
      </div>
    `,
    footer: `
      <button class="btn btn-sm btn-secondary" data-action="modal-close">${tl('common.cancel')}</button>
      <button class="btn btn-sm btn-primary" id="btn-claim-gw">${tl('dashboard.claimGateway')}</button>
    `,
    onClose() {}
  })

  setTimeout(() => {
    document.getElementById('btn-claim-gw')?.addEventListener('click', async (e) => {
      e.target.disabled = true
      e.target.textContent = tl('common.processing')
      try {
        await bridge.claimGateway()
        location.reload()
      } catch (err) {
        e.target.disabled = false
        e.target.textContent = tl('dashboard.claimGateway')
      }
    })
  }, 50)
}
