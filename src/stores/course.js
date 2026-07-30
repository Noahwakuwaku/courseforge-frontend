import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, pollTask, pollTasksBatch } from '../api'

export const useCourseStore = defineStore('course', () => {
    const allSubjects = ref([])
    const subjectId   = ref(null)
    const subjectName = ref('')
    const courses     = ref([])
    const outlines    = ref({})
    const materials   = ref({})
    const exams       = ref({})
    const loadingMap  = ref({})

    // Batch progress keyed BY SUBJECT so multiple subjects can have
    // independent in-flight batches and the UI shows the right one.
    //   batchProgress[`batch-outline:${subjectId}`] = { done, total, failed }
    const batchProgress = ref({})

    const isLoading  = (key) => !!loadingMap.value[key]
    const setLoading = (key, v) => { loadingMap.value[key] = v }

    // ── batch state helpers (subject-scoped) ─────────────────────────────────────
    //
    // A batch operation lives on ONE subject — the one that was active when the
    // user clicked the button. State keys carry that subject id so:
    //   1. Navigating to a different subject doesn't disable that subject's own
    //      batch buttons.
    //   2. Navigating back to the originating subject still shows live progress.

    function batchKey(type, sid) { return `${type}:${sid}` }

    /** Is there a batch of `type` running on the currently-active subject? */
    function isBatchActive(type) {
        if (!subjectId.value) return false
        return !!loadingMap.value[batchKey(type, subjectId.value)]
    }

    /** Progress object for the current subject's batch, or null. */
    function batchInfo(type) {
        if (!subjectId.value) return null
        return batchProgress.value[batchKey(type, subjectId.value)] || null
    }

    /** Set of subject IDs that have ANY active batch / expand work running.
     *  Used by the sidebar to render a "still working" indicator on subjects
     *  the user isn't currently looking at. */
    const activeWorkSubjects = computed(() => {
        const active = new Set()
        for (const k of Object.keys(loadingMap.value)) {
            if (!loadingMap.value[k]) continue
            const m = k.match(/^(batch-outline|batch-material|batch-exam|expand):(.+)$/)
            if (m) active.add(m[2])
        }
        return active
    })

    // ── sidebar ──────────────────────────────────────────────────────────────────
    async function fetchAllSubjects() {
        setLoading('sidebar', true)
        try { allSubjects.value = await api.listSubjects() }
        finally { setLoading('sidebar', false) }
    }

    async function loadSubject(id) {
        setLoading(`load:${id}`, true)
        try {
            const snap = await api.getSnapshot(id)
            subjectId.value   = snap.subject._id
            subjectName.value = snap.subject.name
            courses.value     = snap.courses
            // ── Merge, don't overwrite ──────────────────────────────────────────────
            // Without merging, if a background batch's onItem fires after the
            // snapshot for this subject was fetched, its write would be clobbered
            // by `outlines.value = snap.outlines`. We merge so the snapshot fills
            // in completed items but any keys written by an active batch survive.
            // (Stale keys belonging to OTHER subjects don't matter — their course
            // IDs simply aren't rendered on this page.)
            outlines.value  = { ...outlines.value,  ...(snap.outlines  || {}) }
            materials.value = { ...materials.value, ...(snap.materials || {}) }
            exams.value     = { ...exams.value,     ...(snap.exams     || {}) }
        } finally {
            setLoading(`load:${id}`, false)
        }
    }

    // ── delete ───────────────────────────────────────────────────────────────────
    async function deleteSubject(id) {
        setLoading(`del:${id}`, true)
        try {
            await api.deleteSubject(id)
            allSubjects.value = allSubjects.value.filter(s => s._id !== id)
            // Clear any batch state for the deleted subject so its progress
            // indicator stops haunting the UI.
            for (const k of Object.keys(loadingMap.value)) {
                if (k.endsWith(`:${id}`)) delete loadingMap.value[k]
            }
            for (const k of Object.keys(batchProgress.value)) {
                if (k.endsWith(`:${id}`)) delete batchProgress.value[k]
            }
            if (subjectId.value === id) $reset()
        } finally { setLoading(`del:${id}`, false) }
    }

    async function deleteSubcategory(subId) {
        setLoading(`del-sub:${subId}`, true)
        try {
            await api.deleteSubcategory(subId)
            const key = `subcategory:${subId}`
            const outline = outlines.value[key]
            if (outline?.lectureId) {
                const mat = materials.value[outline.lectureId]
                if (mat?.materialId) delete exams.value[mat.materialId]
                delete materials.value[outline.lectureId]
            }
            delete outlines.value[key]
            await refreshCourses()
        } finally { setLoading(`del-sub:${subId}`, false) }
    }

    async function deleteCourse(courseId) {
        setLoading(`del-course:${courseId}`, true)
        try {
            await api.deleteCourse(courseId)
            // Local cleanup so the UI doesn't briefly show stale outline/material
            // panels for a course that just got deleted. refreshCourses() rebuilds
            // the array from the server, but the outline/material/exam stores are
            // keyed independently and must be pruned by hand.
            const course = courses.value.find(c => c._id === courseId)

            // 1. Course's own chain (only present when it had no subcategories)
            const courseKey = `course:${courseId}`
            const courseOutline = outlines.value[courseKey]
            if (courseOutline?.lectureId) {
                const mat = materials.value[courseOutline.lectureId]
                if (mat?.materialId) delete exams.value[mat.materialId]
                delete materials.value[courseOutline.lectureId]
            }
            delete outlines.value[courseKey]

            // 2. Each subcategory's chain
            if (course?.subcategories) {
                for (const sub of course.subcategories) {
                    const subKey = `subcategory:${sub._id}`
                    const subOutline = outlines.value[subKey]
                    if (subOutline?.lectureId) {
                        const mat = materials.value[subOutline.lectureId]
                        if (mat?.materialId) delete exams.value[mat.materialId]
                        delete materials.value[subOutline.lectureId]
                    }
                    delete outlines.value[subKey]
                }
            }

            // 3. Drop the course row from the visible list. (refreshCourses below
            //    would also do this, but optimistically splicing first makes the
            //    UI update instantly rather than waiting on the GET.)
            courses.value = courses.value.filter(c => c._id !== courseId)
            await refreshCourses()
        } finally {
            setLoading(`del-course:${courseId}`, false)
        }
    }

    // ── skeleton ──────────────────────────────────────────────────────────────────
    async function generateSkeleton(name) {
        setLoading('skeleton', true)
        try {
            const res = await api.createSubject(name)
            await loadSubject(res.subject_id)
            await fetchAllSubjects()
        } finally { setLoading('skeleton', false) }
    }

    async function batchCreateSubjects(names) {
        setLoading('skeleton', true)
        try {
            await Promise.all(names.map(async (name) => {
                await api.createSubject(name)
            }))
            await fetchAllSubjects()
        } finally { setLoading('skeleton', false) }
    }

    async function refreshCourses(forSubjectId = null) {
        const sid = forSubjectId || subjectId.value
        if (!sid) return
        const fresh = await api.getCourses(sid)
        // Only update the visible courses array if it still belongs to this
        // subject — otherwise we'd swap the active page's courses for a
        // different subject's data.
        if (subjectId.value === sid) {
            courses.value = fresh
        }
    }

    /**
     * Expand all courses into subcategories — queued so the API server
     * doesn't block on N parallel LLM calls.
     *
     * State is scoped to the subject this expand was kicked off for, so
     * navigating to another subject doesn't disable that subject's expand
     * button.
     */
    async function expandAll() {
        const sid = subjectId.value
        if (!sid) return
        const lkey = batchKey('expand', sid)
        setLoading(lkey, true)
        batchProgress.value[lkey] = { done: 0, total: 0, failed: 0 }
        try {
            const { tasks } = await api.expandSubjectAsync(sid)
            if (!tasks?.length) return
            batchProgress.value[lkey].total = tasks.length

            const items = tasks.map(t => ({ taskId: t.task_id, course_id: t.course_id }))

            await pollTasksBatch(items, {
                onItem: async () => {
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].done++
                    await refreshCourses(sid)
                },
                onError: () => {
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                },
            })
        } finally {
            setLoading(lkey, false)
            delete batchProgress.value[lkey]
        }
    }

    // ── outlines (single-task path, kept for individual buttons) ────────────────
    async function generateOutlines(items) {
        await Promise.all(items.map(_generateOneOutline))
    }

    async function _generateOneOutline({ type, id }) {
        const key = `${type}:${id}`
        setLoading(key, true)
        try {
            const dispatch = type === 'course'
                ? await api.generateCourseContent(id, subjectName.value)
                : await api.generateSubContent(id, subjectName.value)

            const res = await pollTask(dispatch.task_id)
            outlines.value[key] = { lectureId: res.lecture_id, ...res.content }
            await refreshCourses()
        } finally {
            setLoading(key, false)
        }
    }

    async function regenerateOutline(type, id) {
        const key = `${type}:${id}`
        setLoading(key, true)
        try {
            const dispatch = type === 'course'
                ? await api.regenerateCourseContent(id, subjectName.value)
                : await api.regenerateSubContent(id, subjectName.value)
            const res = await pollTask(dispatch.task_id)
            outlines.value[key] = { lectureId: res.lecture_id, ...res.content }
        } finally { setLoading(key, false) }
    }

    // ── materials ─────────────────────────────────────────────────────────────────
    async function generateMaterial(lectureId) {
        setLoading(`material:${lectureId}`, true)
        try {
            const { task_id } = await api.generateMaterial(lectureId)
            const res = await pollTask(task_id)
            materials.value[lectureId] = { materialId: res.material_id, ...res.material }
        } finally { setLoading(`material:${lectureId}`, false) }
    }

    async function regenerateMaterial(lectureId) {
        setLoading(`material:${lectureId}`, true)
        try {
            const { task_id } = await api.regenerateMaterial(lectureId)
            const res = await pollTask(task_id)
            materials.value[lectureId] = { materialId: res.material_id, ...res.material }
        } finally { setLoading(`material:${lectureId}`, false) }
    }

    // ── exams ─────────────────────────────────────────────────────────────────────
    async function generateExam(materialId) {
        setLoading(`exam:${materialId}`, true)
        try {
            const { task_id } = await api.generateExam(materialId)
            const res = await pollTask(task_id)
            exams.value[materialId] = res.questions
        } finally { setLoading(`exam:${materialId}`, false) }
    }

    // ── batch (high-concurrency path) ────────────────────────────────────────────
    //
    // The state for one batch belongs to the subject it was started on:
    //   - The "全选纲要" button on that subject reflects its own progress.
    //   - The same button on OTHER subjects is unaffected — users can kick off
    //     batches on multiple subjects concurrently and each tracks itself.
    //   - Navigating away and back leaves the batch running; the per-item
    //     spinners and progress counter both survive navigation.
    //
    // Per-item loading flags (`course:xxx`, `subcategory:yyy`, `material:zzz`)
    // are global — keyed by the actual resource id, which is globally unique
    // — so they keep working across navigations without modification.

    async function batchGenerateOutlines(items) {
        if (!items.length) return
        const sid  = subjectId.value
        if (!sid) return
        const lkey = batchKey('batch-outline', sid)
        setLoading(lkey, true)
        batchProgress.value[lkey] = { done: 0, total: items.length, failed: 0 }
        try {
            const enqueued = await Promise.all(items.map(async ({ type, id }) => {
                const key = `${type}:${id}`
                setLoading(key, true)
                try {
                    const dispatch = type === 'course'
                        ? await api.generateCourseContent(id, subjectName.value)
                        : await api.generateSubContent(id, subjectName.value)
                    return { taskId: dispatch.task_id, type, id, key }
                } catch (e) {
                    setLoading(key, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                    return null
                }
            }))
            const tracked = enqueued.filter(Boolean)
            if (!tracked.length) return

            await pollTasksBatch(tracked, {
                onItem: ({ item, result }) => {
                    outlines.value[item.key] = { lectureId: result.lecture_id, ...result.content }
                    setLoading(item.key, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].done++
                },
                onError: ({ item }) => {
                    setLoading(item.key, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                },
            })

            await refreshCourses(sid)
        } finally {
            setLoading(lkey, false)
            delete batchProgress.value[lkey]
        }
    }

    async function batchGenerateMaterials(items) {
        if (!items.length) return
        const sid  = subjectId.value
        if (!sid) return
        const lkey = batchKey('batch-material', sid)
        setLoading(lkey, true)
        batchProgress.value[lkey] = { done: 0, total: items.length, failed: 0 }
        try {
            const enqueued = await Promise.all(items.map(async ({ type, id }) => {
                const outline = outlines.value[`${type}:${id}`]
                if (!outline?.lectureId) return null
                const lectureId = outline.lectureId
                setLoading(`material:${lectureId}`, true)
                try {
                    const { task_id } = await api.generateMaterial(lectureId)
                    return { taskId: task_id, lectureId }
                } catch {
                    setLoading(`material:${lectureId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                    return null
                }
            }))
            const tracked = enqueued.filter(Boolean)
            if (!tracked.length) return

            await pollTasksBatch(tracked, {
                onItem: ({ item, result }) => {
                    materials.value[item.lectureId] = { materialId: result.material_id, ...result.material }
                    setLoading(`material:${item.lectureId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].done++
                },
                onError: ({ item }) => {
                    setLoading(`material:${item.lectureId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                },
            })
        } finally {
            setLoading(lkey, false)
            delete batchProgress.value[lkey]
        }
    }

    async function batchGenerateExams(items) {
        if (!items.length) return
        const sid  = subjectId.value
        if (!sid) return
        const lkey = batchKey('batch-exam', sid)
        setLoading(lkey, true)
        batchProgress.value[lkey] = { done: 0, total: items.length, failed: 0 }
        try {
            const enqueued = await Promise.all(items.map(async ({ type, id }) => {
                const outline = outlines.value[`${type}:${id}`]
                if (!outline?.lectureId) return null
                const mat = materials.value[outline.lectureId]
                if (!mat?.materialId) return null
                const materialId = mat.materialId
                setLoading(`exam:${materialId}`, true)
                try {
                    const { task_id } = await api.generateExam(materialId)
                    return { taskId: task_id, materialId }
                } catch {
                    setLoading(`exam:${materialId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                    return null
                }
            }))
            const tracked = enqueued.filter(Boolean)
            if (!tracked.length) return

            await pollTasksBatch(tracked, {
                onItem: ({ item, result }) => {
                    exams.value[item.materialId] = result.questions
                    setLoading(`exam:${item.materialId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].done++
                },
                onError: ({ item }) => {
                    setLoading(`exam:${item.materialId}`, false)
                    if (batchProgress.value[lkey]) batchProgress.value[lkey].failed++
                },
            })
        } finally {
            setLoading(lkey, false)
            delete batchProgress.value[lkey]
        }
    }

    function $reset() {
        subjectId.value = null; subjectName.value = ''; courses.value = []
        outlines.value = {}; materials.value = {}; exams.value = {}
        // NOTE: we deliberately DON'T clear loadingMap / batchProgress here —
        // background work on other subjects must keep updating its own state.
        // Per-subject keys for the subject being reset (when it's deleted) are
        // cleaned by deleteSubject().
    }

    return {
        allSubjects, subjectId, subjectName, courses, outlines, materials, exams,
        loadingMap, batchProgress,
        isLoading,
        isBatchActive, batchInfo, activeWorkSubjects,
        fetchAllSubjects, loadSubject,
        deleteSubject, deleteSubcategory, deleteCourse,
        generateSkeleton, batchCreateSubjects, refreshCourses, expandAll,
        generateOutlines, regenerateOutline,
        batchGenerateOutlines, batchGenerateMaterials, batchGenerateExams,
        generateMaterial, regenerateMaterial,
        generateExam,
        $reset,
    }
})