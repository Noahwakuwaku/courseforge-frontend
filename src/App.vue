<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCourseStore } from './stores/course'
import { API_BASE } from './api'
import { leafCourses, itemKey, contentVersion, reviewState, parseSubjects } from './utils/course'
import { useLocalReview } from './composables/useLocalReview'
import AppIcon from './components/AppIcon.vue'
import AppDialog from './components/AppDialog.vue'
import CourseReader from './components/CourseReader.vue'
import DeliveryPanel from './components/DeliveryPanel.vue'
import './styles/workspace.css'

const store = useCourseStore()
const view = ref('courses'), filter = ref('all'), search = ref(''), selected = ref([]), readerKey = ref(null)
const mobileNav = ref(false), dialog = ref(null), error = ref(''), notice = ref(''), subjectInput = ref('')
const storageScope = computed(() => `courseforge:reviews:v1:${store.demo ? 'demo' : API_BASE}`)
const { records, plans, storageError, save, confirmPlan } = useLocalReview(storageScope)
const localKey = key => `${store.subjectId}:${key}`
const rows = computed(() => leafCourses(store.courses).map((item, index) => {
  const key = itemKey(item), outline = store.outlines[key]
  const material = store.materials[outline?.lectureId], exam = store.exams[material?.materialId]
  const version = contentVersion(outline, material, exam), review = reviewState(records.value[localKey(key)], version)
  const loading = store.isLoading(key), failure = store.itemErrors[key]
  const generating = { outline: '纲要生成中', material: '材料生成中', exam: '练习生成中' }[store.currentReport?.kind] || '生成中'
  const label = loading ? generating : failure ? '生成失败' : review === 'stale' ? '版本待复核' : review === 'changes' ? '需要修改' : material && review === 'approved' ? '已验收' : material ? '待检查' : outline ? '纲要就绪' : '待生成'
  const tone = loading ? 'orange' : failure || review === 'changes' ? 'red' : review === 'stale' ? 'orange' : material && review === 'approved' ? 'green' : material ? 'blue' : 'neutral'
  return { ...item, key, index, outline, material, exam, version, review, label, tone, loading, failure }
}))
const counts = computed(() => ({ total: rows.value.length, outline: rows.value.filter(r => r.outline).length, material: rows.value.filter(r => r.material).length,
  approved: rows.value.filter(r => r.material && r.review === 'approved').length,
  review: rows.value.filter(r => r.material && r.review !== 'approved').length,
  issues: rows.value.filter(r => r.failure || ['changes', 'stale'].includes(r.review)).length }))
const planSignature = computed(() => contentVersion(rows.value.map(r => [r.key, r.name, r.parent]), null, null))
const planned = computed(() => plans.value[store.subjectId] === planSignature.value)
const busy = computed(() => !!store.currentReport?.running || store.isLoading(`load:${store.subjectId}`))
const blocked = computed(() => busy.value || !!store.currentReport?.uncertain)
const currentRow = computed(() => rows.value.find(r => r.key === readerKey.value))
const currentRecord = computed(() => currentRow.value ? records.value[localKey(currentRow.value.key)] : null)
const filters = computed(() => [{ id: 'all', label: '全部课程', count: counts.value.total }, { id: 'draft', label: '待生成', count: counts.value.total - counts.value.material }, { id: 'review', label: '待检查', count: counts.value.review }, { id: 'approved', label: '已验收', count: counts.value.approved }, { id: 'issues', label: '需处理', count: counts.value.issues }])
const shownRows = computed(() => rows.value.filter(r => (!search.value || `${r.name} ${r.parent}`.toLowerCase().includes(search.value.toLowerCase())) &&
  (filter.value === 'all' || filter.value === 'draft' && !r.material || filter.value === 'review' && r.material && r.review !== 'approved' || filter.value === 'approved' && r.material && r.review === 'approved' || filter.value === 'issues' && (r.failure || ['changes', 'stale'].includes(r.review)))))
const selectedRows = computed(() => rows.value.filter(r => selected.value.includes(r.key)))
const allSelected = computed(() => shownRows.value.length > 0 && shownRows.value.every(r => selected.value.includes(r.key)))
const parsedNames = computed(() => parseSubjects(subjectInput.value))
const phase = computed(() => !planned.value ? 0 : !counts.value.approved ? 1 : counts.value.material < counts.value.total ? 2 : 3)
const stageLabels = ['确认课程计划', '试生成与检查', '批量生成', '审核与交付']
const next = computed(() => {
  if (!planned.value) return { title: '从一份清晰的课程计划开始', desc: '检查课程范围和学习顺序，确认后先试生成一门课程。', label: '确认课程计划', action: 'plan' }
  if (!counts.value.approved) {
    const ready = rows.value.find(r => r.material)
    if (ready) return { title: '先确认一门课，再放心扩展', desc: '检查内容深度、事实和表达方式。通过后，再批量生成其余课程。', label: '检查样本课程', action: 'read', row: ready }
    const sample = selectedRows.value[0] || rows.value.find(r => r.outline) || rows.value[0]
    return { title: '先用一门课程验证方向', desc: '可勾选一门代表课程作为样本，确认内容质量后再扩大生成范围。', label: sample?.outline ? '试生成学习材料' : '试生成课程纲要', action: 'sample', row: sample }
  }
  if (counts.value.outline < counts.value.total) return { title: '样本已确认，继续搭好其余课程', desc: '仅生成尚未准备好的纲要，已完成的内容会被保留。', label: `生成剩余纲要 · ${counts.value.total - counts.value.outline}`, action: 'outline' }
  if (counts.value.material < counts.value.total) return { title: '把课程结构展开为可学的内容', desc: '批量生成其余学习材料。完成后逐门检查，练习题可以按需补充。', label: `生成剩余材料 · ${counts.value.total - counts.value.material}`, action: 'material' }
  return { title: counts.value.review ? '内容已备齐，让质量走完最后一步' : '课程已验收，准备交付橘智', desc: counts.value.review ? '生成完成不等于验收通过。检查内容，记录需要完善的地方。' : '配置接收接口，确认范围后同步为橘智草稿。', label: counts.value.review ? '检查课程内容' : '配置接口并同步', action: counts.value.review ? 'review' : 'delivery' }
})
async function safely(action) {
  error.value = ''; notice.value = ''
  try { await action() } catch (e) { error.value = /fetch|network/i.test(e.message) ? '暂时无法连接后端，请确认 API 服务已启动，再重试。' : e.message || '操作未完成，请稍后重试。' }
}
function resetView() { view.value = 'courses'; filter.value = 'all'; search.value = ''; selected.value = []; readerKey.value = null; mobileNav.value = false }
watch(() => store.subjectId, resetView)
watch(() => rows.value.map(r => r.key).join(','), () => { selected.value = selected.value.filter(k => rows.value.some(r => r.key === k)) })
function navigate(target) { readerKey.value = null; view.value = target; mobileNav.value = false; if (target === 'review') filter.value = 'review'; else filter.value = 'all' }
function toggleAll() { selected.value = allSelected.value ? selected.value.filter(k => !shownRows.value.some(r => r.key === k)) : [...new Set([...selected.value, ...shownRows.value.map(r => r.key)])] }
function openReader(row) { readerKey.value = row.key; window.scrollTo({ top: 0 }) }
function requestGenerate(kind, items, regenerate = false) {
  const eligible = items.filter(r => kind === 'outline' ? regenerate || !r.outline : kind === 'material' ? r.outline && (regenerate || !r.material) : r.material && (regenerate || !r.exam?.length))
  if (!eligible.length || blocked.value) return
  dialog.value = { type: 'generate', kind, items: eligible, regenerate }
}
const kindLabel = kind => ({ outline: '课程纲要', material: '学习材料', exam: '练习题', expand: '课程分类' }[kind] || '内容')
async function confirmGenerate() {
  const spec = dialog.value; dialog.value = null; selected.value = []
  await safely(() => store.runBatch(spec.kind, spec.items, spec.regenerate))
}
function primaryAction() {
  const n = next.value
  if (n.action === 'plan') { confirmPlan(store.subjectId, planSignature.value); notice.value = '课程计划已在此浏览器确认。接下来试生成一门代表课程。' }
  else if (n.action === 'read') openReader(n.row)
  else if (n.action === 'sample' && n.row) requestGenerate(n.row.outline ? 'material' : 'outline', [n.row])
  else if (['outline', 'material'].includes(n.action)) requestGenerate(n.action, rows.value)
  else navigate(n.action)
}
function review(status, note) {
  const row = currentRow.value
  if (!row?.material || blocked.value) return
  save(localKey(row.key), row.version, status, note)
  notice.value = status === 'approved' ? '已在当前浏览器标记验收通过。' : '已记录修改意见。'
}
async function create() {
  if (!parsedNames.value.length || parsedNames.value.length > 5) return
  await safely(async () => { await store.createSubjects(parsedNames.value); subjectInput.value = ''; dialog.value = null })
}
async function enterDemo() { await safely(() => { store.enterDemo(); resetView(); dialog.value = null; const url = new URL(location.href); url.searchParams.set('demo', '1'); history.replaceState({}, '', url) }) }
async function exitDemo() { await safely(async () => { const url = new URL(location.href); url.searchParams.delete('demo'); history.replaceState({}, '', url); await store.exitDemo(); resetView() }) }
async function remove() { const spec = dialog.value; dialog.value = null; await safely(() => spec.item ? store.deleteItem(spec.item) : store.deleteSubject(spec.id)) }
onMounted(() => { if (new URLSearchParams(location.search).get('demo') === '1') enterDemo(); else safely(store.fetchAllSubjects) })
</script>

<template>
  <div class="workspace">
    <button v-if="mobileNav" class="nav-scrim" aria-label="关闭导航" @click="mobileNav = false" />
    <aside class="sidebar" :class="{ open: mobileNav }">
      <a class="brand" href="#" @click.prevent="store.home(); resetView()">
        <span class="brand-mark">
          <AppIcon name="layers" :size="23" />
        </span>
        <span>CourseForge<small>橘智课程工作台</small>
        </span>
      </a>
      <button class="button primary new-plan" :disabled="store.demo" @click="dialog = { type: 'create' }">
      <AppIcon name="plus" :size="18" /> 新建课程计划</button>
      <nav class="main-nav" aria-label="工作区导航">
        <button :class="{ active: !store.subjectId && view !== 'delivery' }" @click="store.home(); resetView()">
        <AppIcon name="grid" /> 工作台</button>
        <button :disabled="!store.subjectId" :class="{ active: store.subjectId && view === 'review' && !readerKey }" @click="navigate('review')">
          <AppIcon name="shield" /> 内容检查<span v-if="counts.review" class="nav-count">{{ counts.review }}</span>
        </button>
        <button :class="{ active: view === 'delivery' && !readerKey }" @click="navigate('delivery')">
          <AppIcon name="cloud" /> 橘智交付<span class="small-dot" />
        </button>
      </nav>
      <div class="sidebar-label">
        <span>课程计划</span>
        <span>{{ store.allSubjects.length }}</span>
      </div>
      <div class="subject-nav">
        <span v-if="store.isLoading('sidebar')" class="nav-loading">正在读取计划…</span>
        <button v-for="s in store.allSubjects" :key="s._id" :class="{ active: store.subjectId === s._id }" :disabled="store.isLoading(`load:${s._id}`)" @click="safely(() => store.loadSubject(s._id)); resetView()">
          <AppIcon name="book" :size="17" />
          <span>{{ s.name }}</span>
          <span v-if="store.activeWorkSubjects.has(s._id)" class="spinner" />
        </button>
        <p v-if="!store.isLoading('sidebar') && !store.allSubjects.length" class="sidebar-empty">第一份课程计划<br>从一个主题开始。</p>
      </div>
      <div class="sidebar-bottom">
        <div class="connection-card">
          <span class="orange-monogram">橘</span>
          <div>
            <strong>连接橘智</strong>
              <small>配置接口并同步</small>
          </div>
            <button class="icon-button" aria-label="配置橘智同步接口" @click="navigate('delivery')">
            <AppIcon name="chevron" :size="17" />
          </button>
        </div>
        <div class="profile">
          <span class="avatar">C</span>
          <div>
            <strong>创作者工作区</strong>
            <small>把知识，编织成体系</small>
          </div>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumbs">
          <button class="icon-button mobile-menu" aria-label="打开导航" @click="mobileNav = true">
            <AppIcon name="menu" />
          </button>
          <span>工作区</span>
          <AppIcon name="chevron" :size="13" />
          <strong>{{ store.subjectName || '课程工作台' }}</strong>
          <template v-if="readerKey">
            <AppIcon name="chevron" :size="13" />
            <span>内容预览</span>
          </template>
        </div>
        <div class="topbar-tools">
          <span class="connection-status">
          <i :class="{ connected: store.online && !store.demo }" />{{ store.demo ? '示例工作区' : store.online ? '后端已连接' : store.online === false ? '后端未连接' : '正在连接' }}</span>
          <button class="text-button" :disabled="store.anyWork" @click="store.demo ? exitDemo() : enterDemo()">{{ store.demo ? '退出示例' : '体验示例' }}<AppIcon :name="store.demo ? 'close' : 'play'" :size="14" />
          </button>
        </div>
      </header>
      <div v-if="store.demo" class="demo-banner">
        <AppIcon name="info" :size="15" />
        <span>示例模式 · 内容与生成过程为本地演示，不产生模型费用，也不会写入真实数据。</span>
      </div>
      <main id="main-content" class="main-content">
        <div v-if="error" class="message error" role="alert">
          <AppIcon name="alert" :size="19" />
          <span>{{ error }}</span>
          <button class="icon-button" aria-label="关闭错误提示" @click="error = ''">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div v-if="notice" class="message success" role="status">
          <AppIcon name="check" :size="18" />
          <span>{{ notice }}</span>
          <button class="icon-button" aria-label="关闭提示" @click="notice = ''">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div v-if="storageError" class="message warning" role="alert">{{ storageError }}</div>
        <section v-if="!store.subjectId && view !== 'delivery'" class="dashboard">
          <div class="welcome-hero">
            <div>
              <div class="eyebrow">A LITTLE STRUCTURE. A LOT OF POSSIBILITY.</div>
              <h1>让知识成体系，<br>让创作有章法<span>。</span>
              </h1>
              <p>从一个主题出发，规划、生成、检查。<br>为橘智准备值得学习的课程内容。</p>
              <button class="button primary large" :disabled="store.demo" @click="dialog = { type: 'create' }">创建第一步：课程计划<AppIcon name="arrow" :size="18" />
              </button>
            </div>
            <div class="hero-art" aria-hidden="true">
              <div class="art-orbit">
              </div>
              <div class="art-sheet back-sheet">
              </div>
              <div class="art-sheet">
                <span class="art-stamp">
                  <AppIcon name="leaf" :size="28" />
                </span>
                <span class="art-line long">
                </span>
                <span class="art-line">
                </span>
                <div class="art-step">
                  <i>01</i>
                  <b>
                  </b>
                </div>
                <div class="art-step">
                  <i>02</i>
                  <b>
                  </b>
                </div>
                <div class="art-step">
                  <i>03</i>
                  <b>
                  </b>
                </div>
                <span class="art-label">KNOWLEDGE, CONNECTED.</span>
              </div>
              <div class="art-check">
                <AppIcon name="check" :size="22" />
              </div>
            </div>
          </div>
          <div class="how-it-works">
            <div v-for="(label, i) in ['规划课程结构', '试生成，再批量', '检查并准备交付']" :key="label">
              <span>{{ String(i + 1).padStart(2, '0') }}</span>
              <div>
                <h3>{{ label }}</h3>
                <p>{{ ['让范围与学习顺序先清晰起来', '先确认一门课，减少整批返工', '让每一份内容都有明确的状态'][i] }}</p>
              </div>
            </div>
          </div>
          <div class="section-heading plans-heading">
            <div>
              <h2>你的课程计划 <span class="muted">{{ store.allSubjects.length }}</span>
              </h2>
              <p>从上次停下的地方继续。</p>
            </div>
            <button class="text-button" :disabled="store.anyWork" @click="safely(store.fetchAllSubjects)">
            <AppIcon name="refresh" :size="16" /> 刷新</button>
          </div>
          <div class="plan-grid" v-if="store.allSubjects.length">
            <button v-for="s in store.allSubjects" :key="s._id" class="plan-card" @click="safely(() => store.loadSubject(s._id))">
              <span class="plan-card-icon">
                <AppIcon name="book" :size="23" />
              </span>
              <h3>{{ s.name }}</h3>
              <p>{{ store.activeWorkSubjects.has(s._id) ? '正在后台生成' : '打开课程结构与生成内容' }}</p>
              <span class="plan-card-footer">继续完善 <AppIcon name="arrow" :size="17" />
              </span>
            </button>
          </div>
          <div v-else class="welcome-empty">
            <AppIcon name="book" :size="26" />
            <div>
              <h3>{{ store.online === false ? '连接后端，开始真实创作' : '还没有课程计划' }}</h3>
              <p>{{ store.online === false ? '启动 FastAPI 与 Worker 后重试；也可以先体验一份示例课程。' : '输入主题即可规划课程。想先了解流程？体验示例工作区。' }}</p>
            </div>
            <button class="button secondary" :disabled="store.anyWork" @click="enterDemo">体验示例 <AppIcon name="arrow" :size="16" />
            </button>
          </div>
        </section>
        <CourseReader v-else-if="currentRow" :row="currentRow" :record="currentRecord" :busy="blocked" @back="readerKey = null" @review="review" @generate="(kind, regen) => requestGenerate(kind, [currentRow], regen)" />
        <DeliveryPanel v-else-if="view === 'delivery'" :rows="rows" :subject-id="store.subjectId" :subject-name="store.subjectName || '请先选择课程计划'" :records="records" :planned="planned" :blocked="blocked" :demo="store.demo" @review="navigate('review')" />
        <section v-else class="course-workspace">
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ view === 'review' ? 'REVIEW & REFINE' : 'YOUR NEXT GREAT COURSE' }}</div>
              <h1>{{ store.subjectName }}<span class="heading-tag">课程计划</span>
              </h1>
              <p>{{ view === 'review' ? '把时间留给判断，让每门课程经得起检查。' : '把一个主题，逐步变成一套值得学习的课程。' }}</p>
            </div>
            <div class="heading-actions">
              <button class="button secondary small" :disabled="busy || store.demo" @click="safely(() => store.loadSubject(store.subjectId))">
              <AppIcon name="refresh" :size="15" /> 刷新内容</button>
              <details class="more-menu">
                <summary aria-label="课程计划更多操作">
                  <AppIcon name="more" />
                </summary>
                <div>
                  <button :disabled="store.anyWork || store.demo" @click="dialog = { type:'delete', id: store.subjectId, name: store.subjectName }">删除课程计划</button>
                </div>
              </details>
            </div>
          </div>
          <nav class="stage-nav" aria-label="课程生产阶段">
            <button v-for="(label, i) in stageLabels" :key="label" :class="{ current: phase === i, completed: phase > i }" :aria-current="phase === i ? 'step' : undefined" @click="navigate(i === 3 ? 'review' : 'courses')">
              <span>
                <AppIcon v-if="phase > i" name="check" :size="15" />
                <template v-else>{{ i + 1 }}</template>
              </span>{{ label }}<AppIcon v-if="i < 3" name="chevron" :size="14" />
            </button>
          </nav>
          <div class="stats-grid">
            <div>
              <span>课程总数</span>
              <strong>{{ counts.total }}<small>门</small>
              </strong>
              <p>按课程与子分类展开</p>
            </div>
            <div>
              <span>材料已生成</span>
              <strong>{{ counts.material }}<small>/ {{ counts.total }}</small>
              </strong>
              <div class="mini-progress">
                <i :style="{ width: `${counts.total ? counts.material / counts.total * 100 : 0}%` }" />
              </div>
            </div>
            <div>
              <span>待你检查</span>
              <strong class="accent-text">{{ counts.review }}<small>门</small>
              </strong>
              <p>生成成功后，仍需内容验收</p>
            </div>
            <div>
              <span>本地已验收</span>
              <strong>{{ counts.approved }}<small>门</small>
              </strong>
              <p>标记保存在当前浏览器</p>
            </div>
          </div>
          <div v-if="store.currentReport" class="batch-report" role="status">
            <AppIcon :name="store.currentReport.running ? 'clock' : 'info'" :size="19" />
            <div>
              <strong>{{ kindLabel(store.currentReport.kind) }} · {{ store.currentReport.running ? '正在生成' : store.currentReport.uncertain ? '结果待确认' : '本次任务已结束' }}</strong>
              <span>成功 {{ store.currentReport.done }} / {{ store.currentReport.total }}<template v-if="store.currentReport.failures.length"> · 失败 {{ store.currentReport.failures.length }}</template>
              </span>
              <p v-if="store.currentReport.message">{{ store.currentReport.message }}</p>
            </div>
            <button v-if="!busy && store.currentReport.uncertain && store.currentReport.pending?.length" class="button secondary small" @click="safely(store.resumeBatch)">重新查询任务</button>
            <button v-else-if="!blocked && store.currentReport.failures.length && store.currentReport.kind !== 'expand'" class="button secondary small" @click="requestGenerate(store.currentReport.kind, store.currentReport.failures, store.currentReport.regenerate)">重试失败项</button>
          </div>
          <div class="workspace-columns">
            <div class="course-main">
              <div class="next-step" v-if="view !== 'review'">
                <div class="next-icon">
                  <AppIcon name="spark" :size="21" />
                </div>
                <div>
                  <span class="eyebrow">下一步</span>
                  <h2>{{ next.title }}</h2>
                  <p>{{ next.desc }}</p>
                </div>
                <button class="button primary" :disabled="blocked || !rows.length" @click="primaryAction">
                  <span v-if="busy" class="spinner" />{{ busy ? '生成进行中' : next.label }}<AppIcon v-if="!busy" name="arrow" :size="17" />
                </button>
              </div>
              <div class="course-table">
                <div class="list-heading">
                  <div>
                    <h2>{{ view === 'review' ? '内容检查' : '课程目录' }}<span>{{ counts.total }}</span>
                    </h2>
                    <p>{{ view === 'review' ? '检查事实、学习目标与练习，留下明确结论。' : '先看整体，再逐门完善。选择课程可批量操作。' }}</p>
                  </div>
                  <button v-if="view !== 'review'" class="text-button" :disabled="blocked || store.demo || !!counts.outline" title="适用于尚未生成纲要的课程；已有内容时避免重复展开" @click="dialog = { type: 'expand' }">
                  <AppIcon name="layers" :size="15" /> 细分课程</button>
                </div>
                <div class="list-toolbar">
                  <div class="filter-tabs" aria-label="筛选课程">
                    <button v-for="f in filters" :key="f.id" :class="{ active: filter === f.id }" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}<span>{{ f.count }}</span>
                    </button>
                  </div>
                  <label class="search-field">
                    <AppIcon name="search" :size="16" />
                    <input v-model="search" placeholder="搜索课程" aria-label="搜索课程" />
                  </label>
                </div>
                <div class="selection-bar" v-if="selectedRows.length">
                  <strong>已选 {{ selectedRows.length }} 门</strong>
                  <div>
                    <button class="text-button" :disabled="blocked || !selectedRows.some(r => !r.outline)" @click="requestGenerate('outline', selectedRows)">生成纲要</button>
                    <button class="text-button" :disabled="blocked || !selectedRows.some(r => r.outline && !r.material)" @click="requestGenerate('material', selectedRows)">生成材料</button>
                    <button class="text-button" :disabled="blocked || !selectedRows.some(r => r.material && !r.exam?.length)" @click="requestGenerate('exam', selectedRows)">补充练习</button>
                    <button class="icon-button" aria-label="取消选择" @click="selected = []">
                      <AppIcon name="close" :size="16" />
                    </button>
                  </div>
                </div>
                <div class="table-columns">
                  <label class="select-cell">
                    <input type="checkbox" :checked="allSelected" :indeterminate="selectedRows.length > 0 && !allSelected" :disabled="!shownRows.length" aria-label="全选当前筛选课程" @change="toggleAll" />
                  </label>
                  <span>课程 / 内容</span>
                  <span>准备进度</span>
                  <span>状态</span>
                  <span class="align-right">操作</span>
                </div>
                <div v-for="row in shownRows" :key="row.key" class="course-row" :class="{ selected: selected.includes(row.key) }">
                  <label class="select-cell">
                    <input v-model="selected" type="checkbox" :value="row.key" :aria-label="`选择${row.name}`" />
                  </label>
                  <div class="course-title-cell">
                    <span class="row-number">{{ String(row.index + 1).padStart(2, '0') }}</span>
                    <div>
                      <button class="course-name" @click="openReader(row)">{{ row.name }}</button>
                      <p>{{ row.parent || (row.material ? `${row.material.sections?.length || 0} 个章节${row.exam?.length ? ` · ${row.exam.length} 道练习` : ' · 可补充练习'}` : row.outline ? '纲要已就绪，可以生成学习材料' : '从课程纲要开始') }}</p>
                      <p v-if="row.failure" class="row-error">{{ row.failure.message }}</p>
                    </div>
                  </div>
                  <div class="content-milestones">
                    <span :class="{ done: row.outline }" :title="row.outline ? '纲要已生成' : '纲要待生成'">纲</span>
                    <i />
                    <span :class="{ done: row.material }" :title="row.material ? '材料已生成' : '材料待生成'">文</span>
                    <i />
                    <span :class="{ done: row.exam?.length }" :title="row.exam?.length ? '练习已生成' : '练习尚未生成（可选）'">练</span>
                  </div>
                  <span class="badge" :class="row.tone">
                  <span v-if="row.loading" class="spinner" />{{ row.label }}</span>
                  <div class="row-actions">
                    <button class="text-button" :disabled="blocked" @click="row.material ? openReader(row) : requestGenerate(row.outline ? 'material' : 'outline', [row])">{{ row.material ? '检查内容' : row.outline ? '生成材料' : '生成纲要' }}<AppIcon name="chevron" :size="14" />
                    </button>
                    <details class="more-menu">
                      <summary :aria-label="`${row.name}更多操作`">
                        <AppIcon name="more" :size="18" />
                      </summary>
                      <div>
                        <button @click="openReader(row)">预览纲要与内容</button>
                        <button :disabled="blocked || !row.material" @click="requestGenerate('exam', [row], !!row.exam?.length)">{{ row.exam?.length ? '重新生成练习' : '生成练习题' }}</button>
                        <button :disabled="blocked || !row.outline" @click="requestGenerate('outline', [row], true)">重新生成纲要</button>
                        <button :disabled="store.anyWork || store.demo" @click="dialog = { type: 'delete', item: row, name: row.name }">删除课程</button>
                      </div>
                    </details>
                  </div>
                </div>
                <div v-if="!shownRows.length" class="empty-state compact">
                  <AppIcon name="search" :size="27" />
                  <h3>{{ rows.length ? '没有符合条件的课程' : '课程计划里还没有课程' }}</h3>
                  <p>{{ rows.length ? '试试其他关键词或筛选条件。' : '可刷新内容，或重新创建课程计划。' }}</p>
                  <button v-if="rows.length" class="text-button" @click="filter = 'all'; search = ''">查看全部课程</button>
                </div>
                <footer class="table-footer">
                  <span>显示 {{ shownRows.length }} / {{ counts.total }} 门课程</span>
                  <span>
                  <AppIcon name="info" :size="13" /> 已生成 ≠ 已验收</span>
                </footer>
              </div>
            </div>
            <aside class="context-rail">
              <div class="rail-card">
                <span class="rail-icon">
                  <AppIcon name="leaf" :size="21" />
                </span>
                <h3>先试一门，再成体系</h3>
                <p>选择有代表性的课程，确认深度和表达方式，让批量生成沿着正确的方向继续。</p>
                <div class="rail-divider">
                </div>
                <span class="eyebrow">生成费用</span>
                <strong class="cost-placeholder">暂未计量 <AppIcon name="info" :size="14" />
                </strong>
                <p class="small-copy">后端尚未提供 token 与费用数据。每次真实生成均可能产生模型费用。</p>
              </div>
              <div class="rail-card delivery-teaser">
                <span class="orange-monogram">橘</span>
                <h3>好内容，下一站橘智</h3>
                <p>检查完成后，统一准备课程交付。</p>
                <button class="text-button" @click="navigate('delivery')">查看交付准备<AppIcon name="arrow" :size="16" />
                </button>
                <span class="integration-caption">填写接收接口即可连接</span>
              </div>
            </aside>
          </div>
        </section>
        <footer class="workspace-footer">
          <span>CourseForge <i> / </i> 为系统学习而创作</span>
          <span>结构先行 · 内容有据 · 交付有序</span>
        </footer>
      </main>
    </div>
    <AppDialog v-if="dialog" :title="({ create:'新建课程计划', generate: `${dialog.regenerate ? '重新生成' : '生成'}${kindLabel(dialog.kind)}`, delete:'删除前，请确认', expand:'细分课程结构' })[dialog.type]" @close="dialog = null">
      <form v-if="dialog.type === 'create'" class="dialog-body" @submit.prevent="create">
        <p class="dialog-intro">一个清晰的主题，就是一套课程的起点。</p>
        <label class="field-label" for="subject-input">你想准备什么课程？</label>
        <textarea id="subject-input" v-model="subjectInput" autofocus rows="3" placeholder="例如：产品设计基础、统计学入门" :disabled="store.isLoading('skeleton')" />
        <p class="field-help">多个主题用逗号或换行分隔，一次最多 5 个。</p>
        <div class="example-chips">
          <button v-for="t in ['产品设计基础', '统计学入门', 'Python 编程']" :key="t" type="button" :disabled="store.isLoading('skeleton')" @click="subjectInput = t">{{ t }}<AppIcon name="plus" :size="13" />
          </button>
        </div>
        <div class="form-note">
        <AppIcon name="info" :size="17" /> 先生成课程结构，确认后再生成正文。此操作调用模型，费用由你的模型服务商计收。</div>
        <p v-if="error" class="inline-warning" role="alert">{{ error }}</p>
        <p v-if="parsedNames.length > 5" class="inline-warning">请将本次主题数量减少到 5 个以内。</p>
        <div class="dialog-actions">
          <button type="button" class="button secondary" @click="dialog = null">取消</button>
          <button class="button primary" :disabled="!parsedNames.length || parsedNames.length > 5 || store.isLoading('skeleton')">
            <span v-if="store.isLoading('skeleton')" class="spinner" />{{ store.isLoading('skeleton') ? '正在规划，请稍候' : `生成课程计划${parsedNames.length > 1 ? ` · ${parsedNames.length}` : ''}` }}<AppIcon v-if="!store.isLoading('skeleton')" name="arrow" :size="16" />
          </button>
        </div>
      </form>
      <div v-else-if="dialog.type === 'generate'" class="dialog-body">
        <p class="dialog-intro">{{ dialog.regenerate ? '将重新生成选中的内容。旧内容可能被后端覆盖，相关材料、练习和审核结论需要重新检查。' : '确认本次范围，生成会在后台继续。你可以留在页面查看每门课的进度。' }}</p>
        <ul class="generation-scope">
          <li v-for="item in dialog.items" :key="item.id">
          <AppIcon name="book" :size="16" />{{ item.name }}</li>
        </ul>
        <div class="generation-summary">
          <span>{{ dialog.items.length }} 门课程 · {{ kindLabel(dialog.kind) }}</span>
          <strong>{{ store.demo ? '示例生成 · 无费用' : '费用暂未计量' }}</strong>
        </div>
        <p class="field-help">{{ store.demo ? '仅模拟生成过程，不调用真实后端。' : '本次操作会调用模型。后端尚未提供费用估算，请按你的服务额度控制批量规模。' }}</p>
        <div class="dialog-actions">
          <button class="button secondary" @click="dialog = null">返回调整</button>
          <button class="button primary" @click="confirmGenerate">{{ dialog.regenerate ? '确认重新生成' : '开始生成' }}<AppIcon name="arrow" :size="16" />
          </button>
        </div>
      </div>
      <div v-else-if="dialog.type === 'delete'" class="dialog-body">
        <p class="dialog-intro">删除「{{ dialog.name }}」及其相关的纲要、材料和练习。此操作无法撤销。</p>
        <div class="dialog-actions">
          <button class="button secondary" @click="dialog = null">保留内容</button>
          <button class="button danger" @click="remove">确认删除</button>
        </div>
      </div>
      <div v-else-if="dialog.type === 'expand'" class="dialog-body">
        <p class="dialog-intro">让模型判断课程是否需要进一步拆分。此操作会调用模型；细分后，请重新确认课程结构。</p>
        <div class="dialog-actions">
          <button class="button secondary" @click="dialog = null">暂不细分</button>
          <button class="button primary" @click="dialog = null; safely(store.expandAll)">开始细分课程</button>
        </div>
      </div>
    </AppDialog>
  </div>
</template>
