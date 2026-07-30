const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
    }
    return res.json()
}

/**
 * Poll a single task until SUCCESS or FAILURE.
 * Kept for back-compat / single-task calls. For batch operations use
 * `pollTasksBatch` below — it polls all in-flight tasks in one HTTP request
 * per cycle, regardless of how many are running.
 */
export async function pollTask(taskId, { interval = 1500, onState } = {}) {
    let backoff = interval
    while (true) {
        let data
        try {
            data = await request('GET', `/tasks/${taskId}`)
            backoff = interval  // success: reset
        } catch (e) {
            // Transient HTTP failure on the polling side itself — don't kill the
            // user's wait. Back off, then retry. Cap at 8x base interval.
            backoff = Math.min(backoff * 2, interval * 8)
            await new Promise(r => setTimeout(r, backoff))
            continue
        }
        onState?.(data.state)
        if (data.state === 'SUCCESS') return data.result
        if (data.state === 'FAILURE') throw new Error(data.result?.error || 'Task failed')
        await new Promise(r => setTimeout(r, interval))
    }
}

/**
 * Poll many tasks at once.
 *
 * - `items` is an array of `{ taskId, ...payload }`. The payload is opaque
 *   here — it's whatever your caller needs to map a task_id back to the UI
 *   item that triggered it (e.g. `{ type: 'course', id, key }`).
 * - `onItem({ item, result })` fires once per task as soon as it succeeds.
 * - `onError({ item, error })` fires once per task that fails.
 * - Returns a promise that resolves when *every* task is settled.
 *
 * One HTTP request per polling cycle, no matter how many tasks are open.
 * This is the difference between 1 RPS and 30 RPS during a batch run.
 */
export async function pollTasksBatch(items, {
    interval = 1500,
    onItem,
    onError,
} = {}) {
    // Map: taskId -> item. Items are removed as they settle.
    const pending = new Map(items.map(it => [it.taskId, it]))
    let backoff = interval

    while (pending.size > 0) {
        let data
        try {
            data = await request('POST', '/tasks/batch', {
                task_ids: [...pending.keys()],
            })
            backoff = interval
        } catch {
            backoff = Math.min(backoff * 2, interval * 8)
            await new Promise(r => setTimeout(r, backoff))
            continue
        }

        for (const [tid, info] of Object.entries(data.tasks || {})) {
            if (info.state === 'SUCCESS') {
                const item = pending.get(tid)
                pending.delete(tid)
                onItem?.({ item, result: info.result })
            } else if (info.state === 'FAILURE') {
                const item = pending.get(tid)
                pending.delete(tid)
                onError?.({ item, error: info.result?.error || 'Task failed' })
            } else if (info.state === 'NOT_FOUND') {
                // Result expired or never existed — treat as terminal so we don't
                // poll forever.
                const item = pending.get(tid)
                pending.delete(tid)
                onError?.({ item, error: 'Task not found' })
            }
            // PENDING / STARTED → keep in the map, poll next cycle.
        }

        if (pending.size > 0) {
            await new Promise(r => setTimeout(r, interval))
        }
    }
}

export const api = {
    // Subjects
    listSubjects:    ()           => request('GET',    '/subjects'),
    createSubject:   (name)       => request('POST',   '/subjects', { name }),
    deleteSubject:   (subjectId)  => request('DELETE', `/subjects/${subjectId}`),
    getSnapshot:     (subjectId)  => request('GET',    `/subjects/${subjectId}/snapshot`),
    getCourses:      (subjectId)  => request('GET',    `/subjects/${subjectId}/courses`),
    expandSubject:   (subjectId)  => request('POST',   `/subjects/${subjectId}/expand`),
    expandSubjectAsync: (subjectId) => request('POST', `/subjects/${subjectId}/expand/async`),

    // Outline — returns { task_id }
    generateCourseContent:   (courseId, subjectName) => request('POST', `/courses/${courseId}/content`,        { subject_name: subjectName }),
    regenerateCourseContent: (courseId, subjectName) => request('POST', `/courses/${courseId}/regenerate`,     { subject_name: subjectName }),
    generateSubContent:      (subId,    subjectName) => request('POST', `/subcategories/${subId}/content`,     { subject_name: subjectName }),
    regenerateSubContent:    (subId,    subjectName) => request('POST', `/subcategories/${subId}/regenerate`,  { subject_name: subjectName }),
    deleteSubcategory:       (subId)                 => request('DELETE', `/subcategories/${subId}`),
    deleteCourse:            (courseId)              => request('DELETE', `/courses/${courseId}`),

    // Lectures
    getLecture: (refType, refId) => request('GET', `/lectures/${refType}/${refId}`),

    // Material — returns { task_id }
    generateMaterial:   (lectureId) => request('POST', `/lectures/${lectureId}/material`),
    regenerateMaterial: (lectureId) => request('POST', `/lectures/${lectureId}/material/regenerate`),
    getMaterial:        (lectureId) => request('GET',  `/lectures/${lectureId}/material`),

    // Exam — returns { task_id }
    generateExam: (materialId) => request('POST', `/materials/${materialId}/exam`),
    getExam:      (materialId) => request('GET',  `/materials/${materialId}/exam`),

    // Task polling
    getTask:        (taskId)    => request('GET',  `/tasks/${taskId}`),
    getTasksBatch:  (taskIds)   => request('POST', `/tasks/batch`, { task_ids: taskIds }),
}