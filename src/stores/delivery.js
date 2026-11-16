import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { API_BASE } from '../api/index.js'
import { deliveryRequest, normalizeEndpoint, parseCapabilities, parseDeliveryResult, SUCCESS_STATUSES } from '../utils/delivery.js'

export const DELIVERY_STORAGE = `courseforge:delivery:v1:${API_BASE}`

export const useDeliveryStore = defineStore('delivery', () => {
  let saved = {}
  const storageError = ref('')
  try { saved = JSON.parse(localStorage.getItem(DELIVERY_STORAGE) || '{}') || {} } catch { storageError.value = '无法读取同步记录，请确认浏览器允许本地存储。' }
  const sourceId = ref(typeof saved.sourceId === 'string' ? saved.sourceId : crypto.randomUUID())
  const endpoint = ref(typeof saved.endpoint === 'string' ? saved.endpoint : '')
  const token = ref('') // Short-lived user-scoped import token; never persisted or logged.
  const connection = ref('idle'), connectionError = ref(''), maxCourses = ref(0), busy = ref(false)
  const history = ref(Array.isArray(saved.history) ? saved.history.slice(0, 20) : [])
  const pending = ref(saved.pending?.payload?.delivery_id && saved.pending?.endpoint ? saved.pending : null)
  const verifiedEndpoint = ref(''), verifiedToken = ref('')
  const ready = computed(() => connection.value === 'ready' && endpoint.value === verifiedEndpoint.value && token.value === verifiedToken.value)

  function persist() {
    try {
      localStorage.setItem(DELIVERY_STORAGE, JSON.stringify({ sourceId: sourceId.value, endpoint: endpoint.value, history: history.value, pending: pending.value }))
      storageError.value = ''; return true
    } catch { storageError.value = '无法保存同步记录。为避免丢失请求编号，请释放浏览器存储后再发送。'; return false }
  }

  async function connect(address, secret = '') {
    if (busy.value || connection.value === 'checking') return
    connectionError.value = ''; connection.value = 'checking'
    try {
      endpoint.value = normalizeEndpoint(address); token.value = secret
      if (!persist()) throw new Error(storageError.value)
      const caps = parseCapabilities(await deliveryRequest(endpoint.value, { token: token.value }))
      maxCourses.value = caps.maxCourses; verifiedEndpoint.value = endpoint.value; verifiedToken.value = token.value
      connection.value = 'ready'
    } catch (e) { connection.value = 'failed'; connectionError.value = e.message }
  }

  function connectionChanged() { if (!busy.value && connection.value !== 'checking') { connection.value = 'idle'; verifiedEndpoint.value = '' } }

  function receipt(subjectId, key, version) {
    for (const entry of history.value) {
      if (entry.endpoint !== endpoint.value || entry.subjectId !== subjectId) continue
      const item = entry.results?.find(r => r.source_key === key && r.localVersion === version)
      if (item && SUCCESS_STATUSES.includes(item.status)) return item
    }
    return null
  }

  async function transmit() {
    if (!pending.value || !ready.value || endpoint.value !== pending.value.endpoint || busy.value) throw new Error('请先检测原请求使用的接口地址，再继续同步。')
    const job = pending.value
    busy.value = true
    try {
      const data = await deliveryRequest(job.endpoint, { method: 'POST', token: token.value, payload: job.payload, timeout: 60000 })
      const results = parseDeliveryResult(data, job.payload).map(r => ({ ...r, localVersion: job.versions[r.source_key] }))
      const entry = { id: job.payload.delivery_id, endpoint: job.endpoint, subjectId: job.payload.subject.id,
        subjectName: job.payload.subject.name, at: new Date().toISOString(), results }
      history.value = [entry, ...history.value.filter(e => e.id !== entry.id)].slice(0, 20)
      if (results.some(r => r.status === 'unknown')) { job.error = '部分课程的返回无法确认，请使用原请求重试；不要另建一批。' }
      else pending.value = null
      persist()
    } catch (e) {
      // Even HTTP 500 may follow a successful write. Keep the identical request for idempotent replay.
      job.error = e.message; persist()
    } finally { busy.value = false }
  }

  async function send(payload, versions) {
    if (pending.value) throw new Error('上一次同步结果仍待确认，请先处理原请求。')
    if (!ready.value || busy.value) throw new Error('请先保存并检测接口。')
    if (payload.courses.length > maxCourses.value) throw new Error(`接收端每次最多接受 ${maxCourses.value} 门课程。`)
    pending.value = { endpoint: endpoint.value, payload: JSON.parse(JSON.stringify(payload)), versions: { ...versions }, error: '' }
    if (!persist()) { pending.value = null; throw new Error(storageError.value) }
    await transmit()
  }

  return { sourceId, endpoint, token, connection, connectionError, maxCourses, ready, busy, history, pending, storageError,
    connect, connectionChanged, receipt, send, retry: transmit }
})
