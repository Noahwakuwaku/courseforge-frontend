<template>
  <div class="app-shell">

    <!-- ══════════════ SIDEBAR ══════════════ -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-top">
        <div class="logo">
          <span class="logo-icon">⬡</span>
          <span class="logo-text" v-if="!sidebarCollapsed">CourseForge</span>
        </div>
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '›' : '‹' }}
        </button>
      </div>

      <button class="sidebar-new-btn" @click="startNew" :title="sidebarCollapsed ? '新建学科' : ''">
        <span class="new-icon">＋</span>
        <span v-if="!sidebarCollapsed">新建学科</span>
      </button>

      <div class="sidebar-section-label" v-if="!sidebarCollapsed">我的学科</div>

      <div class="subject-list">
        <div v-if="store.isLoading('sidebar')" class="sidebar-loading"><span class="spin-small" /></div>

        <div
            v-for="subj in store.allSubjects"
            :key="subj._id"
            class="subject-item-wrap"
            :class="{ active: store.subjectId === subj._id }"
        >
          <button
              class="subject-item"
              @click="handleLoadSubject(subj._id)"
              :disabled="store.isLoading(`load:${subj._id}`)"
              :title="subj.name"
          >
            <span class="subj-dot" :class="subj.status" />
            <span class="subj-name" v-if="!sidebarCollapsed">{{ subj.name }}</span>
            <span v-if="store.isLoading(`load:${subj._id}`)" class="spin-small" />
            <span
                v-else-if="store.activeWorkSubjects.has(subj._id)"
                class="subj-working"
                :title="'正在生成中…'"
            />
          </button>
          <!-- Delete subject button -->
          <button
              v-if="!sidebarCollapsed"
              class="subj-del-btn"
              @click.stop="confirmDeleteSubject(subj)"
              :disabled="store.isLoading(`del:${subj._id}`)"
              title="删除学科"
          >
            <span v-if="store.isLoading(`del:${subj._id}`)" class="spin-small" />
            <span v-else>✕</span>
          </button>
        </div>

        <div class="sidebar-empty" v-if="!store.isLoading('sidebar') && store.allSubjects.length === 0 && !sidebarCollapsed">
          还没有学科，点击「新建」开始
        </div>
      </div>
    </aside>

    <!-- ══════════════ MAIN AREA ══════════════ -->
    <div class="main-area">

      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <template v-if="store.subjectId">
            <nav class="breadcrumb">
              <button class="bc-item bc-root" @click="backToCourses">
                <span class="subject-badge-sm">{{ store.subjectName }}</span>
              </button>
              <span class="bc-sep" v-if="readerOpen || examOpen">›</span>
              <span class="bc-item" v-if="(readerOpen || examOpen) && currentMaterial">{{ currentMaterial.course_title }}</span>
              <span class="bc-sep" v-if="examOpen">›</span>
              <span class="bc-item" v-if="examOpen">课后测验</span>
            </nav>
          </template>
          <template v-else>
            <span class="header-title">课程体系生成器</span>
          </template>
        </div>
        <div class="header-right">
          <span class="tagline" v-if="!store.subjectId">AI-Powered Curriculum Architecture</span>
        </div>
      </header>

      <!-- ── Welcome ── -->
      <main class="page-content" v-if="!store.subjectId">
        <div class="welcome-wrap">
          <div class="welcome-card">
            <div class="welcome-icon">⬡</div>
            <h2 class="welcome-title">开始构建课程体系</h2>
            <p class="welcome-desc">输入一个学科名称，AI 将自动规划完整的课程骨架</p>
            <div class="input-group">
              <input
                  v-model="subjectInput"
                  class="text-input"
                  placeholder="支持批量：斯宾诺莎哲学，黑格尔哲学，统计学"
                  @keyup.enter="handleGenerate"
                  ref="inputEl"
              />
              <button class="btn btn-primary" @click="handleGenerate" :disabled="store.isLoading('skeleton')">
                <span v-if="store.isLoading('skeleton')" class="spinner" />
                <span v-else>生成 →</span>
              </button>
            </div>
            <!-- Batch preview: show parsed names before submitting -->
            <div class="batch-preview" v-if="parsedSubjects.length > 1">
              <span class="batch-preview-label">将创建 {{ parsedSubjects.length }} 个学科：</span>
              <span v-for="(s, i) in parsedSubjects" :key="i" class="batch-tag">{{ s }}</span>
            </div>
          </div>
          <div class="recent-subjects" v-if="store.allSubjects.length > 0">
            <p class="recent-label">最近学科</p>
            <div class="recent-grid">
              <button v-for="subj in store.allSubjects.slice(0,6)" :key="subj._id" class="recent-card" @click="handleLoadSubject(subj._id)" :disabled="store.isLoading(`load:${subj._id}`)">
                <span class="recent-dot" :class="subj.status" />
                <span class="recent-name">{{ subj.name }}</span>
                <span v-if="store.isLoading(`load:${subj._id}`)" class="spin-small" />
                <span v-else class="recent-arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- ── Course skeleton ── -->
      <main class="page-content" v-if="store.subjectId && !readerOpen && !examOpen">
        <div class="skeleton-section">
          <div class="section-header">
            <div>
              <h2 class="section-title"><span class="subject-badge">{{ store.subjectName }}</span>&nbsp;课程体系</h2>
              <p class="section-desc">选中课程可单独操作，也可使用下方批量按钮全选生成</p>
            </div>
            <div class="action-col">
              <!-- Row 1: expand -->
              <div class="action-row">
                <button class="btn btn-secondary btn-sm" @click="store.expandAll()" :disabled="store.isBatchActive('expand')">
                  <template v-if="store.isBatchActive('expand')">
                    <span class="spinner" />
                    <span v-if="store.batchInfo('expand')" class="batch-progress">
                      {{ store.batchInfo('expand').done }}/{{ store.batchInfo('expand').total }}
                    </span>
                  </template>
                  <span v-else>⬡ 展开子分类</span>
                </button>
              </div>
              <!-- Row 2: batch actions -->
              <div class="action-row batch-row">
                <!-- All-outline -->
                <button
                    class="btn btn-batch"
                    @click="batchGenerateOutlines"
                    :disabled="pendingOutlineItems.length === 0 || store.isBatchActive('batch-outline')"
                    title="为所有还未生成纲要的课程/子分类生成纲要"
                >
                  <template v-if="store.isBatchActive('batch-outline')">
                    <span class="spinner" />
                    <span v-if="store.batchInfo('batch-outline')" class="batch-progress">
                      {{ store.batchInfo('batch-outline').done }}/{{ store.batchInfo('batch-outline').total }}
                      <span v-if="store.batchInfo('batch-outline').failed" class="batch-failed">·{{ store.batchInfo('batch-outline').failed }}失败</span>
                    </span>
                  </template>
                  <span v-else>📋 全选纲要 <span class="batch-count" v-if="pendingOutlineItems.length">({{ pendingOutlineItems.length }})</span></span>
                </button>
                <!-- All-material -->
                <button
                    class="btn btn-batch"
                    @click="batchGenerateMaterials"
                    :disabled="pendingMaterialItems.length === 0 || store.isBatchActive('batch-material')"
                    title="为所有已有纲要但还未生成材料的课程生成材料"
                >
                  <template v-if="store.isBatchActive('batch-material')">
                    <span class="spinner" />
                    <span v-if="store.batchInfo('batch-material')" class="batch-progress">
                      {{ store.batchInfo('batch-material').done }}/{{ store.batchInfo('batch-material').total }}
                      <span v-if="store.batchInfo('batch-material').failed" class="batch-failed">·{{ store.batchInfo('batch-material').failed }}失败</span>
                    </span>
                  </template>
                  <span v-else>📚 全选材料 <span class="batch-count" v-if="pendingMaterialItems.length">({{ pendingMaterialItems.length }})</span></span>
                </button>
                <!-- All-exam -->
                <button
                    class="btn btn-batch"
                    @click="batchGenerateExams"
                    :disabled="pendingExamItems.length === 0 || store.isBatchActive('batch-exam')"
                    title="为所有已有材料但还未生成考试的课程生成考题"
                >
                  <template v-if="store.isBatchActive('batch-exam')">
                    <span class="spinner" />
                    <span v-if="store.batchInfo('batch-exam')" class="batch-progress">
                      {{ store.batchInfo('batch-exam').done }}/{{ store.batchInfo('batch-exam').total }}
                      <span v-if="store.batchInfo('batch-exam').failed" class="batch-failed">·{{ store.batchInfo('batch-exam').failed }}失败</span>
                    </span>
                  </template>
                  <span v-else>📝 全选考试 <span class="batch-count" v-if="pendingExamItems.length">({{ pendingExamItems.length }})</span></span>
                </button>
                <!-- Selected outlines -->
                <span class="action-divider" />
                <button class="btn btn-primary btn-sm" @click="generateSelectedOutlines" :disabled="selectedItems.length === 0">
                  生成纲要 ({{ selectedItems.length }})
                </button>
              </div>
            </div>
          </div>

          <!-- Active batch banner (shows when user returns to a subject with in-flight work) -->
          <div class="active-banner" v-if="activeBatchSummary.length">
            <span class="active-banner-pulse" />
            <span class="active-banner-text">后台生成中：</span>
            <span v-for="(b, i) in activeBatchSummary" :key="i" class="active-banner-chip">
              {{ b.label }} {{ b.done }}/{{ b.total }}<span v-if="b.failed" class="batch-failed">·{{ b.failed }}失败</span>
            </span>
          </div>

          <!-- Course cards -->
          <div class="courses-grid">
            <div v-for="course in store.courses" :key="course._id" class="course-card">

              <!-- Card header -->
              <div class="course-header">
                <label class="check-label" v-if="!course.has_subcategories">
                  <input type="checkbox" v-model="selectedCourses" :value="course._id" />
                  <span class="checkmark" />
                </label>
                <span class="course-name">{{ course.name }}</span>
                <span class="status-chip" :class="statusClass(course.status)">{{ statusLabel(course.status, course.has_subcategories) }}</span>
                <!-- Delete course button (cascades to subcategories + all generated content) -->
                <button
                    class="del-course-btn"
                    @click.stop="confirmDeleteCourse(course)"
                    :disabled="store.isLoading(`del-course:${course._id}`)"
                    title="删除该课程及其所有子分类、纲要、材料、考试"
                >
                  <span v-if="store.isLoading(`del-course:${course._id}`)" class="spin-small" />
                  <span v-else>🗑</span>
                </button>
              </div>

              <div v-if="store.isLoading(`course:${course._id}`)" class="generating-bar">
                <span class="dot-pulse" /> 生成中…
              </div>

              <!-- ── Subcategories ── -->
              <div v-if="course.subcategories?.length" class="subcategories">
                <div v-for="sub in course.subcategories" :key="sub._id" class="sub-item">
                  <label class="check-label">
                    <input type="checkbox" v-model="selectedSubs" :value="sub._id" />
                    <span class="checkmark" />
                  </label>
                  <span class="sub-name">{{ sub.name }}</span>
                  <span class="status-chip" :class="statusClass(sub.status)">{{ statusLabel(sub.status) }}</span>
                  <span v-if="store.isLoading(`subcategory:${sub._id}`)" class="spin-small" />
                  <!-- Delete subcategory button -->
                  <button
                      class="del-sub-btn"
                      @click="confirmDeleteSub(sub, course._id)"
                      :disabled="store.isLoading(`del-sub:${sub._id}`)"
                      title="删除子分类"
                  >
                    <span v-if="store.isLoading(`del-sub:${sub._id}`)" class="spin-small" />
                    <span v-else>✕</span>
                  </button>
                </div>
              </div>

              <!-- ── Actions: course level ── -->
              <div class="card-actions" v-if="getOutline('course', course._id)">
                <button class="btn-link" @click="openOutlinePanel('course', course._id)">📋 纲要</button>
                <button class="btn-link" @click="store.regenerateOutline('course', course._id)" :disabled="store.isLoading(`course:${course._id}`)">↺ 重生成纲要</button>
                <!-- Material -->
                <button
                    class="btn-link accent2"
                    @click="handleGenerateMaterial('course', course._id)"
                    :disabled="store.isLoading(`material:${getOutline('course', course._id)?.lectureId}`)"
                >
                  <span v-if="store.isLoading(`material:${getOutline('course', course._id)?.lectureId}`)" class="spin-small" />
                  <span v-else>{{ getMaterial(getOutline('course', course._id)?.lectureId) ? '↺ 重生成材料' : '📚 生成材料' }}</span>
                </button>
                <!-- Read -->
                <button v-if="getMaterial(getOutline('course', course._id)?.lectureId)" class="btn-link green" @click="openReader('course', course._id)">🎓 阅读</button>
                <!-- Exam — same level as material -->
                <template v-if="getMaterial(getOutline('course', course._id)?.lectureId)">
                  <span class="action-divider" />
                  <button
                      class="btn-link purple"
                      @click="handleGenerateExamFromCard('course', course._id)"
                      :disabled="store.isLoading(`exam:${getMaterial(getOutline('course', course._id)?.lectureId)?.materialId}`)"
                  >
                    <span v-if="store.isLoading(`exam:${getMaterial(getOutline('course', course._id)?.lectureId)?.materialId}`)" class="spin-small" />
                    <span v-else>{{ store.exams[getMaterial(getOutline('course', course._id)?.lectureId)?.materialId] ? '↺ 重生成考题' : '📝 生成考题' }}</span>
                  </button>
                  <button
                      v-if="store.exams[getMaterial(getOutline('course', course._id)?.lectureId)?.materialId]"
                      class="btn-link"
                      @click="openExamFromCard('course', course._id)"
                  >📊 查看考试</button>
                </template>
              </div>

              <!-- ── Actions: subcategory level ── -->
              <template v-if="course.subcategories?.length">
                <div v-for="sub in course.subcategories" :key="`act-${sub._id}`">
                  <div class="card-actions sub-actions" v-if="getOutline('subcategory', sub._id)">
                    <span class="sub-action-label">{{ sub.name }}：</span>
                    <button class="btn-link" @click="openOutlinePanel('subcategory', sub._id)">📋</button>
                    <button class="btn-link" @click="store.regenerateOutline('subcategory', sub._id)" :disabled="store.isLoading(`subcategory:${sub._id}`)">↺ 纲要</button>
                    <button
                        class="btn-link accent2"
                        @click="handleGenerateMaterial('subcategory', sub._id)"
                        :disabled="store.isLoading(`material:${getOutline('subcategory', sub._id)?.lectureId}`)"
                    >
                      <span v-if="store.isLoading(`material:${getOutline('subcategory', sub._id)?.lectureId}`)" class="spin-small" />
                      <span v-else>{{ getMaterial(getOutline('subcategory', sub._id)?.lectureId) ? '↺ 材料' : '📚 材料' }}</span>
                    </button>
                    <button v-if="getMaterial(getOutline('subcategory', sub._id)?.lectureId)" class="btn-link green" @click="openReader('subcategory', sub._id)">🎓 阅读</button>
                    <!-- Exam for subcategory -->
                    <template v-if="getMaterial(getOutline('subcategory', sub._id)?.lectureId)">
                      <span class="action-divider" />
                      <button
                          class="btn-link purple"
                          @click="handleGenerateExamFromCard('subcategory', sub._id)"
                          :disabled="store.isLoading(`exam:${getMaterial(getOutline('subcategory', sub._id)?.lectureId)?.materialId}`)"
                      >
                        <span v-if="store.isLoading(`exam:${getMaterial(getOutline('subcategory', sub._id)?.lectureId)?.materialId}`)" class="spin-small" />
                        <span v-else>{{ store.exams[getMaterial(getOutline('subcategory', sub._id)?.lectureId)?.materialId] ? '↺ 考题' : '📝 考题' }}</span>
                      </button>
                      <button v-if="store.exams[getMaterial(getOutline('subcategory', sub._id)?.lectureId)?.materialId]" class="btn-link" @click="openExamFromCard('subcategory', sub._id)">📊 考试</button>
                    </template>
                  </div>
                </div>
              </template>

            </div>
          </div>
        </div>
      </main>

      <!-- ── Reader ── -->
      <main class="page-content reader-page" v-if="readerOpen && currentMaterial">
        <div class="reader-layout">
          <aside class="chapter-nav">
            <div class="course-title-nav">{{ currentMaterial.course_title }}</div>
            <nav class="chapter-list">
              <button v-for="(sec, i) in currentMaterial.sections" :key="i" class="chapter-item" :class="{ active: activeSection === i }" @click="activeSection = i; scrollToSection(i)">
                <span class="chap-num">{{ i + 1 }}</span>
                <span class="chap-title">{{ sec.title }}</span>
              </button>
            </nav>
            <div class="nav-footer">
              <button class="btn btn-secondary btn-sm" @click="handleRegenerateMaterial" :disabled="store.isLoading(`material:${currentLectureId}`)">
                <span v-if="store.isLoading(`material:${currentLectureId}`)" class="spinner" /><span v-else>↺ 重新生成材料</span>
              </button>
              <button class="btn btn-primary btn-sm" @click="goToExam" style="margin-top:0.5rem">📝 进入考试</button>
            </div>
          </aside>
          <article class="reader-content" ref="readerContentEl">
            <div class="reader-hero">
              <h1 class="reader-course-title">{{ currentMaterial.course_title }}</h1>
              <div class="reader-meta"><span>{{ currentMaterial.sections?.length }} 个章节</span></div>
            </div>
            <div v-for="(sec, i) in currentMaterial.sections" :key="i" :ref="el => sectionRefs[i] = el" class="section-article">
              <div class="section-title-bar">
                <span class="section-index">{{ i + 1 }}</span>
                <h2 class="section-heading">{{ sec.title }}</h2>
              </div>
              <div class="markdown-body" v-html="renderMarkdown(sec.body)" />
              <div class="summary-box" v-if="sec.summary">
                <span class="summary-icon">💡</span><p>{{ sec.summary }}</p>
              </div>
            </div>
          </article>
        </div>
      </main>

      <!-- ── Exam ── -->
      <main class="page-content" v-if="examOpen && currentMaterialId">
        <div class="exam-section-page">
          <div class="exam-header-bar">
            <h2 class="exam-title">{{ currentMaterial?.course_title }} · 课后测验</h2>
            <button class="btn btn-secondary btn-sm" @click="handleGenerateExam" :disabled="store.isLoading(`exam:${currentMaterialId}`)">
              <span v-if="store.isLoading(`exam:${currentMaterialId}`)" class="spinner" />
              <span v-else>{{ store.exams[currentMaterialId] ? '↺ 重新生成考题' : '生成考题' }}</span>
            </button>
          </div>

          <div v-if="!store.exams[currentMaterialId]" class="exam-empty">
            <div class="exam-empty-icon">📝</div>
            <p>还没有考题，点击右上角「生成考题」开始</p>
          </div>

          <div v-else class="exam-body">
            <div class="score-bar" v-if="examSubmitted">
              <span class="score-val">{{ examScore.correct }} / {{ examScore.total }}</span>
              <span class="score-label">答对题目</span>
              <span class="score-pct" :class="examScore.pct >= 60 ? 'pass' : 'fail'">{{ examScore.pct }}%</span>
            </div>
            <div class="questions-list">
              <div v-for="(q, qi) in store.exams[currentMaterialId]" :key="qi" class="q-card" :class="examSubmitted ? (isCorrect(qi) ? 'q-correct' : 'q-wrong') : ''">
                <div class="q-meta">
                  <span class="q-num">{{ qi + 1 }}</span>
                  <span class="q-diff" :class="q.difficulty">{{ diffLabel(q.difficulty) }}</span>
                  <span class="q-type">{{ q.correct_answers.length > 1 ? '多选' : '单选' }}</span>
                </div>
                <p class="q-text">{{ q.question }}</p>
                <div class="options-grid">
                  <label v-for="(text, key) in q.options" :key="key" class="option-label" :class="optionClass(qi, key, q)">
                    <input :type="q.correct_answers.length > 1 ? 'checkbox' : 'radio'" :name="`q${qi}`" :value="key" v-model="userAnswers[qi]" :disabled="examSubmitted" />
                    <span class="opt-badge">{{ key }}</span><span>{{ text }}</span>
                  </label>
                </div>
                <div class="q-explanation" v-if="examSubmitted">
                  <span class="exp-icon">{{ isCorrect(qi) ? '✅' : '❌' }}</span>{{ q.explanation }}
                </div>
              </div>
            </div>
            <div class="exam-submit-row">
              <button v-if="!examSubmitted" class="btn btn-primary" @click="submitExam">提交答案</button>
              <button v-else class="btn btn-secondary" @click="retryExam">重新作答</button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Outline panel -->
    <Teleport to="body">
      <div class="panel-overlay" v-if="outlinePanel" @click.self="outlinePanel = null">
        <div class="side-panel">
          <div class="panel-header">
            <h3>{{ outlinePanel.title }} · 纲要</h3>
            <button class="modal-close" @click="outlinePanel = null">✕</button>
          </div>
          <div class="panel-body">
            <p class="outline-desc">{{ outlinePanel.description }}</p>
            <div class="meta-row">
              <div><strong>前置知识</strong><ul><li v-for="p in outlinePanel.prerequisites" :key="p">{{ p }}</li></ul></div>
              <div><strong>学习目标</strong><ul><li v-for="o in outlinePanel.learning_outcomes" :key="o">{{ o }}</li></ul></div>
            </div>
            <div class="outline-sections">
              <div v-for="(sec, i) in outlinePanel.sections" :key="i" class="outline-sec">
                <h4><span class="sec-num">{{ i+1 }}</span> {{ sec.title }}</h4>
                <p>{{ sec.content }}</p>
                <div class="key-points"><span v-for="kp in sec.key_points" :key="kp" class="kp-tag">{{ kp }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm delete dialog -->
    <Teleport to="body">
      <div class="modal-overlay" v-if="confirmDialog" @click.self="confirmDialog = null">
        <div class="confirm-dialog">
          <div class="confirm-icon">🗑️</div>
          <h3 class="confirm-title">{{ confirmDialog.title }}</h3>
          <p class="confirm-desc">{{ confirmDialog.desc }}</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" @click="confirmDialog = null">取消</button>
            <button class="btn btn-danger" @click="confirmDialog.action(); confirmDialog = null">
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCourseStore } from './stores/course'

const store = useCourseStore()
const subjectInput    = ref('')
const selectedCourses = ref([])
const selectedSubs    = ref([])
const sidebarCollapsed = ref(false)
const inputEl = ref(null)

const readerOpen        = ref(false)
const examOpen          = ref(false)
const currentLectureId  = ref(null)
const currentMaterialId = ref(null)
const activeSection     = ref(0)
const sectionRefs       = ref([])
const readerContentEl   = ref(null)
const outlinePanel      = ref(null)
const confirmDialog     = ref(null)

const userAnswers   = ref({})
const examSubmitted = ref(false)

onMounted(() => store.fetchAllSubjects())

// ── computed ──────────────────────────────────────────────────────────────────
const selectedItems = computed(() => [
  ...selectedCourses.value.map(id => ({ type: 'course', id })),
  ...selectedSubs.value.map(id  => ({ type: 'subcategory', id })),
])

// All leaf nodes (courses with no subs + all subcategories)
const allLeafItems = computed(() => {
  const items = []
  for (const c of store.courses) {
    if (c.subcategories?.length) {
      for (const s of c.subcategories) items.push({ type: 'subcategory', id: s._id })
    } else {
      items.push({ type: 'course', id: c._id })
    }
  }
  return items
})

// Leaves that have NO outline yet
const pendingOutlineItems = computed(() =>
    allLeafItems.value.filter(({ type, id }) => !getOutline(type, id))
)

// Leaves that have outline but NO material yet
const pendingMaterialItems = computed(() =>
    allLeafItems.value.filter(({ type, id }) => {
      const outline = getOutline(type, id)
      if (!outline?.lectureId) return false
      return !getMaterial(outline.lectureId)
    })
)

// Leaves that have material but NO exam yet
const pendingExamItems = computed(() =>
    allLeafItems.value.filter(({ type, id }) => {
      const outline = getOutline(type, id)
      if (!outline?.lectureId) return false
      const mat = getMaterial(outline.lectureId)
      if (!mat?.materialId) return false
      return !store.exams[mat.materialId]
    })
)

// Summary of any active batches for the current subject — used by the
// "后台生成中" banner so a user returning to a subject mid-batch sees
// what's still being generated without having to remember.
const activeBatchSummary = computed(() => {
  const result = []
  const defs = [
    { type: 'expand',         label: '展开子分类' },
    { type: 'batch-outline',  label: '纲要' },
    { type: 'batch-material', label: '材料' },
    { type: 'batch-exam',     label: '考试' },
  ]
  for (const { type, label } of defs) {
    if (store.isBatchActive(type)) {
      const info = store.batchInfo(type)
      if (info) result.push({ label, ...info })
    }
  }
  return result
})
const currentMaterial = computed(() =>
    currentLectureId.value ? store.materials[currentLectureId.value] || null : null
)
const examScore = computed(() => {
  const qs = store.exams[currentMaterialId.value] || []
  const correct = qs.filter((_, i) => isCorrect(i)).length
  return { correct, total: qs.length, pct: qs.length ? Math.round(correct / qs.length * 100) : 0 }
})

// ── helpers ───────────────────────────────────────────────────────────────────
function getOutline(type, id)  { return store.outlines[`${type}:${id}`] || null }
function getMaterial(lectureId){ return lectureId ? store.materials[lectureId] || null : null }

// ── navigation ────────────────────────────────────────────────────────────────
function backToCourses() { readerOpen.value = false; examOpen.value = false }

function startNew() {
  store.$reset()
  readerOpen.value = false; examOpen.value = false
  subjectInput.value = ''; selectedCourses.value = []; selectedSubs.value = []
  nextTick(() => inputEl.value?.focus())
}

// ── delete confirmations ──────────────────────────────────────────────────────
function confirmDeleteSubject(subj) {
  confirmDialog.value = {
    title: `删除「${subj.name}」？`,
    desc: '将同时删除该学科下的所有课程、纲要、学习材料和考试题目，此操作不可撤销。',
    action: () => store.deleteSubject(subj._id),
  }
}

function confirmDeleteSub(sub, courseId) {
  confirmDialog.value = {
    title: `删除子分类「${sub.name}」？`,
    desc: '将同时删除该子分类的纲要、学习材料和考试题目，此操作不可撤销。',
    action: () => store.deleteSubcategory(sub._id, courseId),
  }
}

function confirmDeleteCourse(course) {
  const n    = course.subcategories?.length || 0
  const desc = n > 0
      ? `将同时删除该课程下的 ${n} 个子分类、所有纲要、学习材料和考试题目，此操作不可撤销。`
      : '将同时删除该课程的纲要、学习材料和考试题目（如有），此操作不可撤销。'
  confirmDialog.value = {
    title: `删除课程「${course.name}」？`,
    desc,
    action: () => store.deleteCourse(course._id),
  }
}

// ── handlers ──────────────────────────────────────────────────────────────────

// Parse comma/Chinese comma/newline separated subject names
const parsedSubjects = computed(() => {
  if (!subjectInput.value.trim()) return []
  return subjectInput.value
      .split(/[,\uff0c\n]+/)
      .map(s => s.trim())
      .filter(Boolean)
})

async function handleGenerate() {
  const subjects = parsedSubjects.value
  if (!subjects.length) return

  subjectInput.value = ''

  if (subjects.length === 1) {
    // Single subject — load into active session after creation
    await store.generateSkeleton(subjects[0])
  } else {
    // Batch — create all in parallel, stay on welcome page, sidebar updates
    await store.batchCreateSubjects(subjects)
  }
}

async function handleLoadSubject(id) {
  if (store.subjectId === id) return
  readerOpen.value = false; examOpen.value = false
  selectedCourses.value = []; selectedSubs.value = []
  await store.loadSubject(id)
}

async function generateSelectedOutlines() {
  const items = selectedItems.value
  selectedCourses.value = []; selectedSubs.value = []
  await store.generateOutlines(items)
}

async function batchGenerateOutlines() {
  await store.batchGenerateOutlines(pendingOutlineItems.value)
}
async function batchGenerateMaterials() {
  await store.batchGenerateMaterials(pendingMaterialItems.value)
}
async function batchGenerateExams() {
  await store.batchGenerateExams(pendingExamItems.value)
}

async function handleGenerateMaterial(type, id) {
  const outline = getOutline(type, id)
  if (!outline?.lectureId) return
  await store.generateMaterial(outline.lectureId)
}

async function handleRegenerateMaterial() {
  if (!currentLectureId.value) return
  await store.regenerateMaterial(currentLectureId.value)
  const mat = store.materials[currentLectureId.value]
  if (mat) currentMaterialId.value = mat.materialId
}

// Exam from course card (without opening exam page)
async function handleGenerateExamFromCard(type, id) {
  const outline = getOutline(type, id)
  if (!outline?.lectureId) return
  const mat = getMaterial(outline.lectureId)
  if (!mat?.materialId) return
  await store.generateExam(mat.materialId)
}

// Open exam page from course card
function openExamFromCard(type, id) {
  const outline = getOutline(type, id)
  if (!outline?.lectureId) return
  const mat = getMaterial(outline.lectureId)
  if (!mat?.materialId) return
  currentLectureId.value  = outline.lectureId
  currentMaterialId.value = mat.materialId
  readerOpen.value = false
  examOpen.value   = true
  userAnswers.value   = {}
  examSubmitted.value = false
}

function openOutlinePanel(type, id) { outlinePanel.value = getOutline(type, id) }

function openReader(type, id) {
  const outline = getOutline(type, id)
  if (!outline?.lectureId) return
  const mat = getMaterial(outline.lectureId)
  if (!mat) return
  currentLectureId.value  = outline.lectureId
  currentMaterialId.value = mat.materialId
  activeSection.value = 0
  readerOpen.value = true; examOpen.value = false
}

function goToExam() {
  readerOpen.value = false; examOpen.value = true
  userAnswers.value = {}; examSubmitted.value = false
}

async function handleGenerateExam() {
  if (!currentMaterialId.value) return
  await store.generateExam(currentMaterialId.value)
  userAnswers.value = {}; examSubmitted.value = false
}

function scrollToSection(i) {
  nextTick(() => { const el = sectionRefs.value[i]; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) })
}

// ── exam ──────────────────────────────────────────────────────────────────────
function isCorrect(qi) {
  const q = store.exams[currentMaterialId.value]?.[qi]
  if (!q) return false
  const ua = userAnswers.value[qi] || []
  const given  = Array.isArray(ua) ? [...ua].sort() : [ua].filter(Boolean).sort()
  return JSON.stringify(given) === JSON.stringify([...q.correct_answers].sort())
}
function optionClass(qi, key, q) {
  if (!examSubmitted.value) return ''
  const isAns = q.correct_answers.includes(key)
  const ua = userAnswers.value[qi] || []
  const picked = Array.isArray(ua) ? ua.includes(key) : ua === key
  if (isAns && picked)  return 'opt-correct'
  if (isAns && !picked) return 'opt-missed'
  if (!isAns && picked) return 'opt-wrong'
  return ''
}
function submitExam() { examSubmitted.value = true }
function retryExam()  { userAnswers.value = {}; examSubmitted.value = false }
function diffLabel(d) { return { easy:'简单', medium:'中等', hard:'难' }[d] || d }

// ── status ─────────────────────────────────────────────────────────────────────
function statusLabel(status, hasSubs) {
  if (hasSubs === null || hasSubs === undefined) return '待评估'
  if (status === 'expanded')      return '已展开'
  if (status === 'outline_done')  return '纲要✓'
  if (status === 'material_done') return '材料✓'
  return '待生成'
}
function statusClass(status) {
  if (status === 'material_done') return 'done'
  if (status === 'outline_done')  return 'outline'
  if (status === 'expanded')      return 'expanded'
  return 'pending'
}

// ── markdown ───────────────────────────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return ''
  const held = []
  const hold = (str) => { held.push(str); return `\x00${held.length - 1}\x00` }
  let html = md
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
          hold(`<pre class="code-block"><code class="lang-${lang}">${escHtml(code.trimEnd())}</code></pre>`))
      .replace(/`([^`\n]+)`/g, (_, c) => hold(`<code class="inline-code">${escHtml(c)}</code>`))
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => hold(`<div class="math-block">${escHtml(m)}</div>`))
      .replace(/\$([^$\n]+?)\$/g, (_, m) => hold(`<span class="math-inline">${escHtml(m)}</span>`))
      .replace(/^### (.+)$/gm, (_, t) => `<h5>${t}</h5>`)
      .replace(/^## (.+)$/gm,  (_, t) => `<h4>${t}</h4>`)
      .replace(/^# (.+)$/gm,   (_, t) => `<h3>${t}</h3>`)
      .replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${t}</strong>`)
      .replace(/\*(.+?)\*/g,     (_, t) => `<em>${t}</em>`)
      .replace(/^> (.+)$/gm,    (_, t) => `<blockquote>${t}</blockquote>`)
      .replace(/^- (.+)$/gm,    (_, t) => `<li>${t}</li>`)
      .replace(/(<li>[\s\S]+?<\/li>)(\n<li>[\s\S]+?<\/li>)*/g, m => `<ul>${m}</ul>`)
      .replace(/\n\n+/g, '</p><p>')
  html = `<p>${html}</p>`
      .replace(/<p><(h[3-5]|pre|ul|blockquote|div)/g, '<$1')
      .replace(/<\/(h[3-5]|pre|ul|blockquote|div)><\/p>/g, '</$1>')
      .replace(/<p><\/p>/g, '')
  return html.replace(/\x00(\d+)\x00/g, (_, i) => held[+i])
}
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root {
  --bg:#090910; --bg2:#111119; --bg3:#1a1a26; --bg4:#22222f;
  --sidebar:#0d0d16; --border:rgba(255,255,255,0.07);
  --accent:#7c6aff; --accent2:#00e5c4;
  --text:#e8e8f0; --text-dim:#6a6a90;
  --success:#00e0a0; --danger:#ff5e7d; --warn:#f5a623;
  --radius:14px; --sidebar-w:220px; --sidebar-collapsed-w:52px;
}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}

/* ── Shell ── */
.app-shell{display:flex;min-height:100vh}

/* ── Sidebar ── */
.sidebar{width:var(--sidebar-w);min-height:100vh;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;position:sticky;top:0;height:100vh;overflow:hidden;transition:width .22s cubic-bezier(.4,0,.2,1);z-index:30}
.sidebar.collapsed{width:var(--sidebar-collapsed-w)}
.sidebar-top{display:flex;align-items:center;justify-content:space-between;padding:1rem .85rem .75rem;border-bottom:1px solid var(--border);flex-shrink:0}
.logo{display:flex;align-items:center;gap:.5rem;overflow:hidden}
.logo-icon{font-size:1.25rem;color:var(--accent);flex-shrink:0}
.logo-text{font-family:'Syne',sans-serif;font-weight:800;font-size:1.1rem;letter-spacing:-.02em;white-space:nowrap}
.collapse-btn{background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem;padding:.2rem .3rem;border-radius:5px;flex-shrink:0;transition:color .15s}
.collapse-btn:hover{color:var(--text)}
.sidebar-new-btn{display:flex;align-items:center;gap:.55rem;margin:.7rem .6rem .4rem;padding:.6rem .7rem;background:rgba(124,106,255,.12);border:1px solid rgba(124,106,255,.25);border-radius:9px;color:var(--accent);font-family:'Syne',sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;transition:all .15s;white-space:nowrap;overflow:hidden}
.sidebar-new-btn:hover{background:rgba(124,106,255,.22)}
.new-icon{font-size:1rem;flex-shrink:0}
.sidebar-section-label{padding:.6rem 1rem .3rem;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-dim);white-space:nowrap}
.subject-list{flex:1;overflow-y:auto;padding:.2rem .4rem 1rem}
.sidebar-loading{display:flex;justify-content:center;padding:1rem}
.sidebar-empty{font-size:.78rem;color:var(--text-dim);padding:.5rem .6rem;line-height:1.5}

/* Subject item row */
.subject-item-wrap{display:flex;align-items:center;border-radius:8px;transition:background .14s}
.subject-item-wrap:hover{background:var(--bg3)}
.subject-item-wrap.active{background:rgba(124,106,255,.12)}
.subject-item{flex:1;display:flex;align-items:center;gap:.55rem;padding:.5rem .55rem;background:none;border:none;color:var(--text-dim);font-size:.83rem;font-family:inherit;cursor:pointer;text-align:left;overflow:hidden;white-space:nowrap;min-width:0}
.subject-item-wrap.active .subject-item{color:var(--accent)}
.subject-item:disabled{opacity:.5;cursor:not-allowed}
.subj-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--text-dim)}
.subj-dot.skeleton_done{background:var(--accent)}
.subj-dot.material_done{background:var(--success)}
.subj-name{flex:1;overflow:hidden;text-overflow:ellipsis}
.subj-del-btn{flex-shrink:0;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.75rem;padding:.3rem .45rem;border-radius:5px;opacity:0;transition:all .15s}
.subject-item-wrap:hover .subj-del-btn{opacity:1}
.subj-del-btn:hover{color:var(--danger);background:rgba(255,94,125,.1)}
.subj-del-btn:disabled{opacity:.4;cursor:not-allowed}

/* Delete subcategory button */
.del-sub-btn{background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.72rem;padding:.2rem .35rem;border-radius:4px;opacity:0;transition:all .14s;flex-shrink:0}
.sub-item:hover .del-sub-btn{opacity:1}
.del-sub-btn:hover{color:var(--danger);background:rgba(255,94,125,.1)}
.del-sub-btn:disabled{opacity:.4;cursor:not-allowed}
.del-course-btn{margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:.78rem;padding:.25rem .4rem;border-radius:4px;opacity:0;transition:all .14s;flex-shrink:0}
.course-card:hover .del-course-btn{opacity:.7}
.del-course-btn:hover{color:var(--danger);background:rgba(255,94,125,.12);opacity:1}
.del-course-btn:disabled{opacity:.4;cursor:not-allowed}

/* ── Main area ── */
.main-area{flex:1;display:flex;flex-direction:column;min-width:0}
.header{display:flex;align-items:center;justify-content:space-between;padding:.9rem 2rem;border-bottom:1px solid var(--border);background:rgba(9,9,16,.85);backdrop-filter:blur(14px);position:sticky;top:0;z-index:20;flex-shrink:0}
.header-title{font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;color:var(--text-dim)}
.tagline{color:var(--text-dim);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase}
.breadcrumb{display:flex;align-items:center;gap:.4rem}
.bc-item{font-size:.88rem;color:var(--text-dim)}
.bc-root{background:none;border:none;cursor:pointer;font-family:inherit;padding:0}
.subject-badge-sm{font-family:'Syne',sans-serif;font-weight:700;font-size:.9rem;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.bc-sep{color:var(--text-dim);font-size:.9rem}

/* ── Pages ── */
.page-content{flex:1;padding:2rem 2.5rem;overflow-y:auto}
.reader-page{padding:0;overflow:hidden}

/* Welcome */
.welcome-wrap{max-width:720px;margin:0 auto;padding-top:3rem}
.welcome-card{background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:2.5rem;text-align:center;margin-bottom:2rem}
.welcome-icon{font-size:2.5rem;margin-bottom:1rem}
.welcome-title{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;margin-bottom:.6rem}
.welcome-desc{color:var(--text-dim);margin-bottom:1.8rem}
.input-group{display:flex;gap:.6rem}
.batch-preview{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-top:.75rem;padding:.6rem .8rem;background:rgba(124,106,255,.06);border:1px solid rgba(124,106,255,.15);border-radius:9px}
.batch-preview-label{font-size:.78rem;color:var(--text-dim);white-space:nowrap}
.batch-tag{background:rgba(124,106,255,.15);color:var(--accent);border-radius:6px;padding:.2rem .55rem;font-size:.78rem;font-family:'Syne',sans-serif;font-weight:600}
.text-input{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:.8rem 1.1rem;color:var(--text);font-size:1rem;font-family:inherit;outline:none;transition:border-color .2s}
.text-input:focus{border-color:var(--accent)}
.recent-label{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:.7rem}
.recent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem}
.recent-card{display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;background:var(--bg2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-family:inherit;font-size:.85rem;color:var(--text);text-align:left;transition:all .15s}
.recent-card:hover{border-color:rgba(124,106,255,.3);background:var(--bg3)}
.recent-card:disabled{opacity:.5;cursor:not-allowed}
.recent-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--accent)}
.recent-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recent-arrow{color:var(--text-dim);font-size:.85rem}

/* Skeleton */
.skeleton-section{max-width:1100px}
.section-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.8rem;flex-wrap:wrap;gap:1rem}
.section-title{font-family:'Syne',sans-serif;font-size:1.45rem;font-weight:700;margin-bottom:.3rem}
.section-desc{color:var(--text-dim);font-size:.88rem}
.subject-badge{background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.action-col{display:flex;flex-direction:column;gap:.5rem;align-items:flex-end}
.action-row{display:flex;gap:.65rem;align-items:center;flex-wrap:wrap}
.batch-row{gap:.45rem}
.btn-batch{background:var(--bg3);border:1px solid var(--border);color:var(--text-dim);font-family:'Syne',sans-serif;font-weight:600;font-size:.78rem;padding:.38rem .75rem;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem;transition:all .15s;white-space:nowrap}
.btn-batch:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.btn-batch:disabled{opacity:.35;cursor:not-allowed}
.batch-count{background:rgba(124,106,255,.2);color:var(--accent);border-radius:99px;padding:0 .4rem;font-size:.72rem}
.batch-progress{font-family:'JetBrains Mono',monospace;font-size:.74rem;color:var(--accent2);font-weight:500;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:.3rem}
.batch-failed{color:var(--danger);font-size:.7rem}
.subj-working{width:6px;height:6px;border-radius:50%;background:var(--accent2);flex-shrink:0;animation:pulse-dot 1.4s ease-in-out infinite;box-shadow:0 0 6px var(--accent2)}
@keyframes pulse-dot{0%,100%{opacity:.4;transform:scale(.85)}50%{opacity:1;transform:scale(1.1)}}
.active-banner{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:1rem 0 1.25rem;padding:.65rem 1rem;background:linear-gradient(90deg,rgba(0,229,196,.08),rgba(124,106,255,.06));border:1px solid rgba(0,229,196,.25);border-radius:10px;font-size:.82rem;color:var(--text)}
.active-banner-pulse{width:8px;height:8px;border-radius:50%;background:var(--accent2);animation:pulse-dot 1.4s ease-in-out infinite;box-shadow:0 0 8px var(--accent2);flex-shrink:0}
.active-banner-text{color:var(--text-dim);font-size:.78rem;letter-spacing:.04em}
.active-banner-chip{background:rgba(0,229,196,.12);color:var(--accent2);border-radius:6px;padding:.18rem .55rem;font-family:'JetBrains Mono',monospace;font-size:.76rem;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:.3rem}
.courses-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:.9rem}
.course-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem 1.3rem;transition:border-color .2s}
.course-card:hover{border-color:rgba(124,106,255,.2)}
.course-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
.course-name{font-family:'Syne',sans-serif;font-weight:600;flex:1;font-size:.92rem}

/* Checkbox */
.check-label{display:flex;align-items:center;cursor:pointer;flex-shrink:0}
.check-label input{display:none}
.checkmark{width:17px;height:17px;border:2px solid var(--text-dim);border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0}
.check-label input:checked+.checkmark{background:var(--accent);border-color:var(--accent)}
.check-label input:checked+.checkmark::after{content:'✓';color:white;font-size:10px;font-weight:700}

/* Status */
.status-chip{font-size:.68rem;padding:.18rem .5rem;border-radius:99px;font-weight:500;flex-shrink:0}
.status-chip.pending {background:rgba(255,255,255,.06);color:var(--text-dim)}
.status-chip.outline {background:rgba(124,106,255,.12);color:var(--accent)}
.status-chip.done    {background:rgba(0,229,160,.12);color:var(--success)}
.status-chip.expanded{background:rgba(0,229,196,.1);color:var(--accent2)}

.generating-bar{display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--accent);margin:.4rem 0}
.subcategories{margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--border)}
.sub-item{display:flex;align-items:center;gap:.45rem;padding:.35rem 0;font-size:.85rem}
.sub-name{flex:1;color:var(--text-dim)}

/* Actions */
.card-actions{margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:.55rem;align-items:center}
.sub-actions{border-top:none;margin-top:.2rem;padding-top:0;padding-left:.4rem}
.sub-action-label{font-size:.75rem;color:var(--text-dim)}
.action-divider{width:1px;height:12px;background:var(--border);flex-shrink:0;margin:0 .1rem}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.72rem 1.3rem;border-radius:9px;font-family:'Syne',sans-serif;font-weight:600;font-size:.87rem;cursor:pointer;border:none;transition:all .15s;white-space:nowrap}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-primary {background:var(--accent);color:#fff}
.btn-primary:hover:not(:disabled){background:#9280ff;transform:translateY(-1px)}
.btn-secondary{background:var(--bg3);border:1px solid var(--border);color:var(--text)}
.btn-secondary:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover:not(:disabled){background:#ff7a96;transform:translateY(-1px)}
.btn-sm{padding:.38rem .8rem;font-size:.78rem}
.btn-link{background:none;border:none;color:var(--accent);cursor:pointer;font-size:.79rem;padding:0;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:.25rem}
.btn-link:hover{text-decoration:underline}
.btn-link.accent2{color:var(--accent2)}
.btn-link.green{color:var(--success)}
.btn-link.purple{color:#c4b5fd}
.btn-link:disabled{opacity:.4;cursor:not-allowed}

/* Spinners */
.spinner  {width:13px;height:13px;border:2px solid rgba(255,255,255,.25);border-top-color:white;border-radius:50%;animation:spin .65s linear infinite;display:inline-block;flex-shrink:0}
.spin-small{width:9px;height:9px;border:2px solid rgba(124,106,255,.25);border-top-color:var(--accent);border-radius:50%;animation:spin .65s linear infinite;display:inline-block;flex-shrink:0}
.dot-pulse{width:5px;height:5px;border-radius:50%;background:var(--accent);animation:pulse 1s ease-in-out infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}

/* ── Reader ── */
.reader-layout{display:grid;grid-template-columns:250px 1fr;height:100%}
.chapter-nav{height:calc(100vh - 57px);overflow-y:auto;padding:1.3rem 1rem;border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:57px;background:var(--sidebar)}
.course-title-nav{font-family:'Syne',sans-serif;font-weight:700;font-size:.88rem;margin-bottom:1rem;color:var(--text);line-height:1.4}
.chapter-list{flex:1;display:flex;flex-direction:column;gap:.15rem;overflow-y:auto}
.chapter-item{display:flex;align-items:flex-start;gap:.55rem;padding:.5rem .6rem;border-radius:7px;background:none;border:none;cursor:pointer;text-align:left;color:var(--text-dim);font-size:.8rem;font-family:inherit;transition:all .14s}
.chapter-item:hover{background:var(--bg3);color:var(--text)}
.chapter-item.active{background:rgba(124,106,255,.12);color:var(--accent)}
.chap-num{width:19px;height:19px;border-radius:4px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700;flex-shrink:0;margin-top:1px}
.chapter-item.active .chap-num{background:var(--accent);color:white}
.chap-title{line-height:1.4}
.nav-footer{padding-top:.9rem;border-top:1px solid var(--border);margin-top:.8rem;display:flex;flex-direction:column;gap:.4rem}
.reader-content{padding:2rem 3rem;overflow-y:auto;height:calc(100vh - 57px)}
.reader-hero{margin-bottom:2.5rem;padding-bottom:1.8rem;border-bottom:1px solid var(--border)}
.reader-course-title{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;line-height:1.2;margin-bottom:.6rem;background:linear-gradient(135deg,var(--text) 60%,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.reader-meta{color:var(--text-dim);font-size:.85rem}
.section-article{margin-bottom:3.5rem;scroll-margin-top:80px}
.section-title-bar{display:flex;align-items:center;gap:.9rem;margin-bottom:1.3rem}
.section-index{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--accent),#a090ff);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem;color:white;flex-shrink:0}
.section-heading{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:700}
.markdown-body{line-height:1.75;color:var(--text)}
.markdown-body h3{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;margin:1.4rem 0 .55rem;color:var(--accent2)}
.markdown-body h4{font-family:'Syne',sans-serif;font-size:.97rem;font-weight:600;margin:1.1rem 0 .45rem}
.markdown-body h5{font-size:.92rem;font-weight:600;margin:.9rem 0 .35rem;color:var(--text-dim)}
.markdown-body p{margin-bottom:.85rem}
.markdown-body strong{color:var(--text);font-weight:600}
.markdown-body em{color:var(--accent2);font-style:italic}
.markdown-body ul{padding-left:1.3rem;margin-bottom:.85rem}
.markdown-body li{margin-bottom:.25rem;color:var(--text-dim)}
.markdown-body blockquote{border-left:3px solid var(--accent);padding:.55rem 1rem;background:rgba(124,106,255,.06);border-radius:0 8px 8px 0;margin:.9rem 0;color:var(--text-dim);font-style:italic}
.code-block{background:var(--bg4);border:1px solid var(--border);border-radius:9px;padding:1rem 1.2rem;overflow-x:auto;margin:.9rem 0;font-family:'JetBrains Mono',monospace;font-size:.83rem;line-height:1.6;color:#c9d1d9}
.inline-code{background:var(--bg4);font-family:'JetBrains Mono',monospace;font-size:.82em;padding:.13em .38em;border-radius:4px;color:var(--accent2)}
.math-block{background:var(--bg3);border-radius:8px;padding:.75rem 1rem;margin:.75rem 0;text-align:center;color:var(--accent2);font-family:'JetBrains Mono',monospace;font-size:.88rem;overflow-x:auto}
.math-inline{color:var(--accent2);font-family:'JetBrains Mono',monospace;font-size:.86em}
.summary-box{display:flex;gap:.75rem;background:rgba(0,229,196,.05);border:1px solid rgba(0,229,196,.16);border-radius:9px;padding:.9rem 1.1rem;margin-top:1.3rem}
.summary-icon{font-size:1rem;flex-shrink:0}
.summary-box p{color:var(--text-dim);font-size:.88rem;line-height:1.6;margin:0}

/* ── Exam page ── */
.exam-section-page{max-width:800px;margin:0 auto}
.exam-header-bar{display:flex;align-items:center;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
.exam-title{font-family:'Syne',sans-serif;font-size:1.25rem;font-weight:700;flex:1}
.exam-empty{text-align:center;padding:4rem 2rem;color:var(--text-dim)}
.exam-empty-icon{font-size:3rem;margin-bottom:1rem}
.score-bar{display:flex;align-items:center;gap:1rem;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1rem 1.5rem;margin-bottom:2rem}
.score-val{font-family:'Syne',sans-serif;font-size:1.8rem;font-weight:800}
.score-label{color:var(--text-dim);font-size:.88rem}
.score-pct{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:700;margin-left:auto}
.score-pct.pass{color:var(--success)}
.score-pct.fail{color:var(--danger)}
.questions-list{display:flex;flex-direction:column;gap:1.1rem}
.q-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.2rem 1.4rem;transition:border-color .2s}
.q-card.q-correct{border-color:rgba(0,224,160,.25)}
.q-card.q-wrong  {border-color:rgba(255,94,125,.25)}
.q-meta{display:flex;align-items:center;gap:.55rem;margin-bottom:.65rem}
.q-num{width:25px;height:25px;border-radius:6px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:.78rem}
.q-diff{font-size:.7rem;padding:.14rem .48rem;border-radius:99px;font-weight:500}
.q-diff.easy  {background:rgba(0,224,160,.1);color:var(--success)}
.q-diff.medium{background:rgba(245,166,35,.1);color:var(--warn)}
.q-diff.hard  {background:rgba(255,94,125,.1);color:var(--danger)}
.q-type{font-size:.7rem;color:var(--text-dim);background:var(--bg4);padding:.14rem .48rem;border-radius:99px}
.q-text{font-size:.93rem;line-height:1.55;margin-bottom:.9rem;font-weight:500}
.options-grid{display:flex;flex-direction:column;gap:.4rem;margin-bottom:.75rem}
.option-label{display:flex;align-items:flex-start;gap:.6rem;padding:.5rem .8rem;border-radius:8px;background:var(--bg3);border:1px solid transparent;cursor:pointer;font-size:.86rem;transition:all .13s;line-height:1.4}
.option-label input{display:none}
.option-label:has(input:checked){border-color:var(--accent);background:rgba(124,106,255,.1)}
.option-label.opt-correct{border-color:rgba(0,224,160,.4);background:rgba(0,224,160,.08);color:var(--success)}
.option-label.opt-missed {border-color:rgba(0,224,160,.25);background:rgba(0,224,160,.04);color:var(--success);opacity:.7}
.option-label.opt-wrong  {border-color:rgba(255,94,125,.4);background:rgba(255,94,125,.08);color:var(--danger)}
.opt-badge{width:21px;height:21px;border-radius:5px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:.73rem;font-weight:700;flex-shrink:0}
.q-explanation{background:var(--bg4);border-radius:8px;padding:.65rem .85rem;font-size:.8rem;color:var(--text-dim);line-height:1.55;display:flex;gap:.5rem}
.exp-icon{flex-shrink:0}
.exam-submit-row{margin-top:1.8rem;display:flex;justify-content:center;gap:1rem;padding-bottom:3rem}

/* ── Outline panel ── */
.panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:100;display:flex;justify-content:flex-end}
.side-panel{background:var(--bg2);border-left:1px solid var(--border);width:100%;max-width:500px;height:100%;display:flex;flex-direction:column;overflow:hidden}
.panel-header{display:flex;justify-content:space-between;align-items:center;padding:1.2rem 1.4rem;border-bottom:1px solid var(--border)}
.panel-header h3{font-family:'Syne',sans-serif;font-size:.97rem;font-weight:700}
.modal-close{background:none;border:none;color:var(--text-dim);font-size:1.1rem;cursor:pointer}
.panel-body{overflow-y:auto;padding:1.4rem;flex:1}
.outline-desc{color:var(--text-dim);margin-bottom:1.1rem;line-height:1.6;font-size:.88rem}
.meta-row{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem;margin-bottom:1.3rem}
.meta-row strong{display:block;font-family:'Syne',sans-serif;font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent2);margin-bottom:.35rem}
.meta-row ul{list-style:none}
.meta-row li{font-size:.82rem;color:var(--text-dim);padding:.16rem 0}
.meta-row li::before{content:'→ ';color:var(--accent)}
.outline-sections{display:flex;flex-direction:column;gap:.75rem}
.outline-sec{background:var(--bg3);border-radius:9px;padding:.85rem 1rem}
.outline-sec h4{display:flex;align-items:center;gap:.4rem;font-family:'Syne',sans-serif;font-size:.86rem;margin-bottom:.3rem}
.sec-num{width:19px;height:19px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700;flex-shrink:0}
.outline-sec p{font-size:.8rem;color:var(--text-dim);line-height:1.5;margin-bottom:.45rem}
.key-points{display:flex;flex-wrap:wrap;gap:.3rem}
.kp-tag{background:rgba(124,106,255,.1);border:1px solid rgba(124,106,255,.18);color:var(--accent);border-radius:5px;padding:.16rem .48rem;font-size:.7rem}

/* ── Confirm dialog ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:1.5rem}
.confirm-dialog{background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:2rem;max-width:420px;width:100%;text-align:center}
.confirm-icon{font-size:2.5rem;margin-bottom:1rem}
.confirm-title{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;margin-bottom:.6rem}
.confirm-desc{color:var(--text-dim);font-size:.88rem;line-height:1.6;margin-bottom:1.8rem}
.confirm-actions{display:flex;gap:.75rem;justify-content:center}
</style>