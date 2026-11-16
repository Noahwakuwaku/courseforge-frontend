import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, pollTasksBatch } from '../api/index.js'
import { itemKey } from '../utils/course.js'
import { createDemoSnapshot, demoContent } from '../data/demo.js'

export const useCourseStore = defineStore('course', () => {
  const allSubjects = ref([]), subjectId = ref(null), subjectName = ref(''), courses = ref([])
  const outlines = ref({}), materials = ref({}), exams = ref({})
  const loadingMap = ref({}), reports = ref({}), itemErrors = ref({}), demo = ref(false), online = ref(null)
  let navigation = 0, revision = 0
  const versions = new Map()
  const isLoading = key => !!loadingMap.value[key]
  const activeWorkSubjects = computed(() => new Set(Object.entries(reports.value).filter(([, r]) => r.running).map(([sid]) => sid)))
  const anyWork = computed(() => Object.values(loadingMap.value).some(Boolean) || Object.values(reports.value).some(r => r.running || r.uncertain))
  const currentReport = computed(() => reports.value[subjectId.value] || null)
  const write = (group, key, value) => { group.value[key] = value; versions.set(`${group === outlines ? 'o' : group === materials ? 'm' : 'e'}:${key}`, ++revision) }
  function merge(group, prefix, incoming, since) {
    for (const [key, value] of Object.entries(incoming || {})) if ((versions.get(`${prefix}:${key}`) || 0) <= since) group.value[key] = value
  }
  async function fetchAllSubjects() {
    if (demo.value) return
    loadingMap.value.sidebar = true
    try { allSubjects.value = await api.listSubjects(); online.value = true }
    catch (e) { online.value = false; throw e }
    finally { loadingMap.value.sidebar = false }
  }
  async function loadSubject(id) {
    if (demo.value) { subjectId.value = 'demo-subject'; subjectName.value = '产品设计基础'; return }
    const nav = ++navigation, since = revision
    loadingMap.value[`load:${id}`] = true
    try {
      const snap = await api.getSnapshot(id)
      if (nav !== navigation) return
      subjectId.value = snap.subject._id; subjectName.value = snap.subject.name; courses.value = snap.courses
      merge(outlines, 'o', snap.outlines, since); merge(materials, 'm', snap.materials, since); merge(exams, 'e', snap.exams, since)
    } finally { loadingMap.value[`load:${id}`] = false }
  }
  function home() { ++navigation; subjectId.value = null; subjectName.value = ''; if (!demo.value) courses.value = [] }
  async function createSubjects(names) {
    if (demo.value) throw new Error('请先退出示例，再创建真实课程计划。')
    if (isLoading('skeleton')) return
    loadingMap.value.skeleton = true
    const failures = [], created = []
    try {
      for (const name of names) { try { created.push(await api.createSubject(name)) } catch { failures.push(name) } }
      await fetchAllSubjects()
      if (created.length === 1) await loadSubject(created[0].subject_id)
      if (failures.length) throw new Error(`未能创建：${failures.join('、')}。其余成功计划已保留。`)
    } finally { loadingMap.value.skeleton = false }
  }
  async function refreshCourses(sid) {
    if (demo.value) return
    const fresh = await api.getCourses(sid)
    if (subjectId.value === sid) courses.value = fresh
  }
  async function expandAll() {
    const sid = subjectId.value
    if (!sid || reports.value[sid]?.running || reports.value[sid]?.uncertain) return
    if (demo.value) throw new Error('示例课程已规划好分类，可直接生成内容。')
    reports.value[sid] = { kind: 'expand', total: 0, done: 0, failures: [], pending: [], running: true }
    const report = reports.value[sid]
    loadingMap.value[`expand:${sid}`] = true
    try {
      const { tasks } = await api.expandSubjectAsync(sid)
      report.total = tasks.length
      report.pending = tasks.map(t => ({ taskId: t.task_id, id: t.course_id, type: 'course' }))
      await monitor(report)
      await refreshCourses(sid)
    } catch (e) {
      report.uncertain = report.pending.length > 0 || !e.status || e.status >= 500
      report.message = report.uncertain && !report.pending.length ? `${e.message} 请先在后端核对是否已派发分类任务，避免重复生成。` : e.message
      throw e
    }
    finally { report.running = false; loadingMap.value[`expand:${sid}`] = false }
  }
  function finish(report, item, result) {
    if (report.kind === 'outline') write(outlines, itemKey(item), { ...result.content, lectureId: result.lecture_id })
    if (report.kind === 'material') write(materials, item.lectureId, { ...result.material, materialId: result.material_id })
    if (report.kind === 'exam') write(exams, item.materialId, result.questions)
    report.done++; loadingMap.value[itemKey(item)] = false; delete itemErrors.value[itemKey(item)]
  }
  function fail(report, item, error) {
    const message = String(error?.message || error)
    report.failures.push({ ...item, message }); itemErrors.value[itemKey(item)] = { kind: report.kind, message }
    loadingMap.value[itemKey(item)] = false
  }
  async function monitor(report) {
    const remove = item => { report.pending = report.pending.filter(p => p.taskId !== item.taskId) }
    await pollTasksBatch([...report.pending], {
      onItem: ({ item, result }) => { finish(report, item, result); remove(item) },
      onError: ({ item, error }) => { fail(report, item, error); remove(item) },
    })
  }
  async function resumeBatch() {
    const sid = subjectId.value, report = reports.value[sid]
    if (!report || report.running || !report.pending?.length) return
    report.running = true
    if (!report.unknownDispatch) report.message = ''
    try { await monitor(report); report.uncertain = !!report.unknownDispatch; if (report.kind === 'expand') await refreshCourses(sid) }
    catch (e) { report.uncertain = true; report.message = e.message; throw e }
    finally { report.running = false }
  }
  async function runBatch(kind, rows, regenerate = false) {
    const sid = subjectId.value, name = subjectName.value
    if (!['outline', 'material', 'exam'].includes(kind)) throw new Error('不支持的生成类型。')
    if (!sid || reports.value[sid]?.running || reports.value[sid]?.uncertain || !rows.length) return
    const items = [...new Map(rows.map(r => [itemKey(r), { ...r }])).values()].filter(r => !isLoading(itemKey(r)))
    if (!items.length) return
    reports.value[sid] = { kind, total: items.length, done: 0, failures: [], pending: [], running: true, regenerate }
    const report = reports.value[sid]
    items.forEach(item => { loadingMap.value[itemKey(item)] = true })
    try {
      for (const item of items) {
        loadingMap.value[itemKey(item)] = true; delete itemErrors.value[itemKey(item)]
        item.lectureId = outlines.value[itemKey(item)]?.lectureId
        item.materialId = materials.value[item.lectureId]?.materialId
        try {
          if (kind === 'material' && !item.lectureId) throw new Error('请先生成纲要。')
          if (kind === 'exam' && !item.materialId) throw new Error('请先生成学习材料。')
          if (demo.value) {
            await new Promise(resolve => setTimeout(resolve, 350))
            const content = demoContent(item.name)
            finish(report, item, { content: content.outline, material: content.material, questions: content.questions, lecture_id: `demo-lecture-${item.id}`, material_id: `demo-material-${item.id}` }); continue
          }
          let dispatch
          if (kind === 'outline') {
            const method = item.type === 'course' ? (regenerate ? api.regenerateCourseContent : api.generateCourseContent) : (regenerate ? api.regenerateSubContent : api.generateSubContent)
            dispatch = await method(item.id, name)
          } else if (kind === 'material') dispatch = await (regenerate ? api.regenerateMaterial : api.generateMaterial)(item.lectureId)
          else dispatch = await api.generateExam(item.materialId)
          if (!dispatch.task_id) throw new Error('服务未返回任务编号。')
          report.pending.push({ ...item, taskId: dispatch.task_id })
        } catch (e) {
          // A lost dispatch response may still have started a paid task. Never auto-retry it.
          if (!demo.value && (!e.status || e.status >= 500) && !/请先生成/.test(e.message)) {
            report.unknownDispatch = true; report.uncertain = true
            report.message = `「${item.name}」提交结果未知。为避免重复计费，已停止提交剩余课程。请刷新内容并在后端核对任务，确认后再重新打开页面。`
            break
          }
          fail(report, item, e)
        }
      }
      if (report.pending.length) await monitor(report)
    } catch (e) {
      report.message = e.message
      report.uncertain = true // Polling failure does not prove server-side failure.
      throw e
    } finally { items.forEach(item => { loadingMap.value[itemKey(item)] = false }); report.running = false }
  }
  async function deleteItem(item) {
    if (anyWork.value) throw new Error('请等待当前操作完成后再删除。')
    if (demo.value) throw new Error('示例模式不删除课程，请切换到真实工作区。')
    const sid = subjectId.value
    await (item.type === 'course' ? api.deleteCourse(item.id) : api.deleteSubcategory(item.id))
    delete outlines.value[itemKey(item)]; await refreshCourses(sid)
  }
  async function deleteSubject(id) {
    if (anyWork.value) throw new Error('请等待当前操作完成后再删除。')
    if (demo.value) throw new Error('示例模式不删除真实数据。')
    await api.deleteSubject(id); allSubjects.value = allSubjects.value.filter(s => s._id !== id)
    if (subjectId.value === id) home()
    delete reports.value[id]
  }
  function enterDemo() {
    if (anyWork.value) throw new Error('请等待当前操作完成，再进入示例。')
    ++navigation; demo.value = true
    const snap = createDemoSnapshot()
    allSubjects.value = [snap.subject]; subjectId.value = snap.subject._id; subjectName.value = snap.subject.name
    courses.value = snap.courses; outlines.value = snap.outlines; materials.value = snap.materials; exams.value = snap.exams
    reports.value = {}; itemErrors.value = {}; versions.clear()
  }
  async function exitDemo() {
    if (anyWork.value) return
    demo.value = false; home(); allSubjects.value = []; outlines.value = {}; materials.value = {}; exams.value = {}
    reports.value = {}; itemErrors.value = {}; versions.clear(); await fetchAllSubjects()
  }
  return { allSubjects, subjectId, subjectName, courses, outlines, materials, exams, demo, online,
    reports, currentReport, itemErrors, isLoading, anyWork, activeWorkSubjects,
    fetchAllSubjects, loadSubject, home, createSubjects, expandAll, runBatch, resumeBatch, deleteItem, deleteSubject, enterDemo, exitDemo }
})
