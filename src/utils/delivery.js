export const DELIVERY_PROTOCOL = 'courseforge.delivery.v1'
export const SUCCESS_STATUSES = ['created', 'updated', 'unchanged']
export const RESULT_LABELS = { created: '已创建草稿', updated: '已更新草稿', unchanged: '版本已存在', failed: '同步失败', conflict: '版本冲突', unknown: '结果待确认' }

export function normalizeEndpoint(value) {
  let url
  try { url = new URL(String(value).trim()) } catch { throw new Error('请填写完整的接口地址，例如 https://juzhi.example/api/courseforge/imports。') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('正式接口必须使用 HTTPS；HTTP 仅允许本机 localhost / 127.0.0.1 调试。')
  if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含账号、密码、查询参数或锚点。鉴权请使用单独的短期访问令牌。')
  return url.href
}

export const canonicalJSON = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

// Include exported metadata in local receipt matching, not just the reviewed body.
export const deliveryLocalVersion = row => canonicalJSON([
  row.key, row.id, row.type, row.name, row.index, row.parentId || null, row.parent || null, row.version,
])

export async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持内容指纹，请使用 HTTPS 或 localhost 打开工作台。')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(value)))
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')
}

export async function makeDeliveryPayload({ sourceId, subject, rows, records, deliveryId = crypto.randomUUID() }) {
  if (!subject?.id || !sourceId || !rows.length) throw new Error('请选择要同步的已验收课程。')
  const seen = new Set()
  const courses = []
  for (const row of rows) {
    if (seen.has(row.key)) throw new Error('同步范围中包含重复课程。')
    seen.add(row.key)
    if (!row.outline || !row.material || row.review !== 'approved' || row.loading || row.failure) throw new Error(`「${row.name}」尚未满足同步条件，请完成当前版本的内容验收。`)
    const { lectureId, ...outline } = row.outline
    const { materialId, ...material } = row.material
    const content = JSON.parse(JSON.stringify({
      source_key: row.key, source_id: row.id, source_type: row.type, title: row.name,
      position: row.index, parent: row.parentId ? { id: row.parentId, title: row.parent } : null,
      outline, material, questions: row.exam || [],
    }))
    courses.push({ ...content, content_version: await sha256(content), review: {
      status: 'approved', reviewed_at: records?.[`${subject.id}:${row.key}`]?.at || null, method: 'browser_local_manual',
    } })
  }
  return { protocol: DELIVERY_PROTOCOL, delivery_id: deliveryId, source_instance_id: sourceId,
    target_status: 'draft', scope: 'selected_courses', subject: { id: subject.id, name: subject.name }, courses }
}

export function parseCapabilities(data) {
  if (data?.protocol !== DELIVERY_PROTOCOL || data?.capabilities?.draft_import !== true || data?.capabilities?.idempotency !== true || !Number.isInteger(data.max_courses) || data.max_courses < 1) {
    throw new Error('接口返回不符合协议。请让接收端实现页面下方的 GET 检测与 POST 导入约定。')
  }
  return { maxCourses: Math.min(data.max_courses, 50) }
}

export function parseDeliveryResult(data, payload) {
  if (data?.protocol !== DELIVERY_PROTOCOL || data?.delivery_id !== payload.delivery_id || !Array.isArray(data.results)) throw new Error('返回缺少正确的 protocol、delivery_id 或 results，不能确认同步成功。')
  const expected = new Set(payload.courses.map(c => c.source_key)), seen = new Set()
  for (const result of data.results) {
    if (!result || !expected.has(result.source_key) || seen.has(result.source_key)) throw new Error('接口返回了重复或不属于本次范围的课程，不能确认同步结果。')
    seen.add(result.source_key)
  }
  return payload.courses.map(course => {
    const result = data.results.find(r => r.source_key === course.source_key)
    const base = { source_key: course.source_key, title: course.title, content_version: course.content_version }
    if (!result || result.content_version !== course.content_version || ![...SUCCESS_STATUSES, 'failed', 'conflict'].includes(result.status)) {
      return { ...base, status: 'unknown', message: '缺少该版本的有效结果，请用原请求重新确认。' }
    }
    if (SUCCESS_STATUSES.includes(result.status) && (typeof result.target_id !== 'string' || !result.target_id.trim() || result.target_status !== 'draft')) {
      return { ...base, status: 'unknown', message: '接收端未提供草稿 ID 或草稿状态，不能确认已保存。' }
    }
    return { ...base, status: result.status, target_id: typeof result.target_id === 'string' ? result.target_id : '',
      message: typeof result.message === 'string' ? result.message.slice(0, 500) : '' }
  })
}

export async function deliveryRequest(endpoint, { method = 'GET', token = '', payload, timeout = 30000 } = {}) {
  const url = normalizeEndpoint(endpoint), controller = new AbortController()
  if (/[\r\n]/.test(token)) throw new Error('访问令牌不能包含换行。')
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const headers = { Accept: 'application/json' }
    if (token.trim()) headers.Authorization = `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}`
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = payload.delivery_id }
    const response = await fetch(url, { method, headers, signal: controller.signal, credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', body: payload ? JSON.stringify(payload) : undefined })
    if (!response.ok) throw Object.assign(new Error(`接口返回 HTTP ${response.status}。${response.status === 401 || response.status === 403 ? '请检查访问令牌和导入权限。' : '请检查接收端日志和接口配置。'}`), { status: response.status })
    if (response.status === 202) throw new Error('接口仅受理任务（HTTP 202），尚未确认保存。v1 接口须返回每门课程的最终结果。')
    try { return await response.json() } catch { throw new Error('接口未返回有效 JSON，请确认填写的是导入 API，而不是网站首页。') }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('接口请求超时，不能判断对方是否已保存。请保留原请求编号重试。')
    if (e instanceof TypeError) throw new Error('无法访问接口，请检查服务、HTTPS 和 CORS；若刚发送了课程，结果可能仍已保存。')
    throw e
  } finally { clearTimeout(timer) }
}

export const CAPABILITY_EXAMPLE = { protocol: DELIVERY_PROTOCOL, capabilities: { draft_import: true, idempotency: true }, max_courses: 20 }
export const REQUEST_EXAMPLE = {
  protocol: DELIVERY_PROTOCOL, delivery_id: '请求 UUID，与 Idempotency-Key 一致', source_instance_id: '来源实例 UUID',
  target_status: 'draft', scope: 'selected_courses', subject: { id: '学科 ID', name: '统计学入门' },
  courses: [{ source_key: 'course:课程ID', source_id: '课程ID', source_type: 'course', title: '描述性统计', position: 0, parent: null,
    content_version: '64 位 SHA-256，详见协议', outline: { title: '描述性统计', description: '课程介绍', prerequisites: [], learning_outcomes: ['理解均值'], sections: [{ title: '集中趋势', content: '纲要描述', key_points: ['均值'] }] },
    material: { course_title: '描述性统计', sections: [{ title: '集中趋势', body: 'Markdown 正文', summary: '章节摘要' }] },
    questions: [{ question: '以下哪项描述集中趋势？', options: { A: '均值', B: '方差' }, correct_answers: ['A'], explanation: '均值描述集中趋势。', difficulty: 'easy' }],
    review: { status: 'approved', reviewed_at: '2026-11-15T08:00:00.000Z', method: 'browser_local_manual' } }],
}
export const RESPONSE_EXAMPLE = { protocol: DELIVERY_PROTOCOL, delivery_id: '原请求 UUID', results: [
  { source_key: 'course:课程ID', content_version: '原内容 SHA-256', status: 'created', target_id: '橘智草稿 ID', target_status: 'draft', message: '' },
] }
