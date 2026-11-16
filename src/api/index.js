export const API_BASE = (import.meta.env?.VITE_API_URL || '/api').replace(/\/$/, '')

export async function request(method, path, body, { timeout = 210000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${API_BASE}${path}`, { method, signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw Object.assign(new Error(typeof payload.detail === 'string' ? payload.detail : `请求失败（HTTP ${res.status}）`), { status: res.status })
    }
    return res.status === 204 ? null : await res.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时，请确认后台任务状态后再重试。')
    throw e
  } finally { clearTimeout(timer) }
}

export async function pollTasksBatch(items, { interval = 1500, timeout = 1200000, maxErrors = 5, onItem, onError } = {}) {
  if (items.some(item => !item.taskId)) throw new Error('服务未返回有效的任务编号。')
  const pending = new Map(items.map(item => [item.taskId, item]))
  const started = Date.now()
  let errors = 0
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  while (pending.size) {
    if (Date.now() - started > timeout) throw new Error('等待任务超时，后台可能仍在运行。请重新查询任务，不要重复提交生成。')
    let data
    try {
      data = await request('POST', '/tasks/batch', { task_ids: [...pending.keys()] }, { timeout: Math.max(1, Math.min(30000, timeout - (Date.now() - started))) })
      errors = 0
    } catch (e) {
      if ((e.status >= 400 && e.status < 500 && e.status !== 429) || ++errors >= maxErrors) throw e
      await sleep(Math.min(interval * 2 ** errors, 12000)); continue
    }
    for (const [id, info] of Object.entries(data.tasks || {})) {
      const item = pending.get(id)
      if (!item) continue
      if (info.state === 'SUCCESS') { pending.delete(id); await onItem?.({ item, result: info.result }) }
      else if (['FAILURE', 'NOT_FOUND'].includes(info.state)) {
        pending.delete(id)
        await onError?.({ item, error: info.result?.error || (info.state === 'NOT_FOUND' ? '任务不存在或结果已过期，请刷新课程。' : '生成失败') })
      }
    }
    if (pending.size) await sleep(interval)
  }
}
export async function pollTask(taskId, options = {}) {
  let result, error
  await pollTasksBatch([{ taskId }], { ...options,
    onItem: ({ result: value }) => { result = value; options.onState?.('SUCCESS') },
    onError: ({ error: value }) => { error = value; options.onState?.('FAILURE') } })
  if (error) throw new Error(error)
  return result
}
export const api = {
  listSubjects: () => request('GET', '/subjects'),
  createSubject: name => request('POST', '/subjects', { name }),
  deleteSubject: id => request('DELETE', `/subjects/${id}`),
  getSnapshot: id => request('GET', `/subjects/${id}/snapshot`),
  getCourses: id => request('GET', `/subjects/${id}/courses`),
  expandSubjectAsync: id => request('POST', `/subjects/${id}/expand/async`),
  generateCourseContent: (id, name) => request('POST', `/courses/${id}/content`, { subject_name: name }),
  regenerateCourseContent: (id, name) => request('POST', `/courses/${id}/regenerate`, { subject_name: name }),
  generateSubContent: (id, name) => request('POST', `/subcategories/${id}/content`, { subject_name: name }),
  regenerateSubContent: (id, name) => request('POST', `/subcategories/${id}/regenerate`, { subject_name: name }),
  deleteSubcategory: id => request('DELETE', `/subcategories/${id}`),
  deleteCourse: id => request('DELETE', `/courses/${id}`),
  generateMaterial: id => request('POST', `/lectures/${id}/material`),
  regenerateMaterial: id => request('POST', `/lectures/${id}/material/regenerate`),
  generateExam: id => request('POST', `/materials/${id}/exam`),
}
