<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { renderMarkdown } from '../utils/markdown'
const props = defineProps({ row: Object, busy: Boolean, record: Object })
const emit = defineEmits(['back', 'review', 'generate'])
const tab = ref('material'), note = ref(''), answers = ref({}), submitted = ref(false)
function resetQuiz() { answers.value = Object.fromEntries((props.row?.exam || []).map((q, i) => [i, q.correct_answers?.length > 1 ? [] : ''])); submitted.value = false }
watch(() => props.row?.key, () => { tab.value = props.row?.material ? 'material' : 'outline' }, { immediate: true })
watch(() => props.row?.version, resetQuiz, { immediate: true })
watch(() => props.record, record => { note.value = record?.note || '' }, { immediate: true })
const qs = computed(() => props.row?.exam || [])
function correct(q, i) { const value = answers.value[i]; const selected = Array.isArray(value) ? value : value ? [value] : []; return JSON.stringify([...selected].sort()) === JSON.stringify([...(q.correct_answers || [])].sort()) }
const score = computed(() => qs.value.filter(correct).length)
</script>
<template>
  <div class="reader-shell" v-if="row">
    <button class="text-button reader-back" @click="emit('back')">
    <AppIcon name="back" :size="17" /> 返回课程计划</button>
    <div class="reader-heading">
      <div>
        <div class="eyebrow">内容工作区</div>
        <h1>{{ row.name }}</h1>
        <p>{{ row.parent || '课程内容与质量检查' }}</p>
      </div>
      <span class="badge" :class="row.tone">{{ row.label }}</span>
    </div>
    <div class="reader-grid">
      <article class="reader-document">
        <div class="reader-tabs" aria-label="内容类型">
          <button v-for="t in [{ id:'material', label:'学习材料' }, { id:'outline', label:'课程纲要' }, { id:'exam', label:'练习与解析' }]" :key="t.id" :class="{ active: tab === t.id }" :aria-pressed="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
        </div>
        <div class="reading-content" v-if="tab === 'material'">
          <template v-if="row.material">
            <div class="article-intro">
              <span class="eyebrow">LEARNING MATERIAL</span>
              <h2>{{ row.material.course_title || row.name }}</h2>
              <p>{{ row.material.sections?.length || 0 }} 个章节 · 请核对事实、案例与学习目标</p>
            </div>
            <nav class="chapter-jumps" aria-label="章节目录">
              <a v-for="(section, i) in row.material.sections" :key="i" :href="`#chapter-${i}`">{{ String(i + 1).padStart(2, '0') }} {{ section.title }}</a>
            </nav>
            <section v-for="(section, i) in row.material.sections" :id="`chapter-${i}`" :key="i" class="chapter">
              <div class="chapter-index">CHAPTER {{ String(i + 1).padStart(2, '0') }}</div>
              <h2>{{ section.title }}</h2>
              <div class="prose" v-html="renderMarkdown(section.body)" />
              <aside class="summary-note" v-if="section.summary">
                <AppIcon name="leaf" />
                <p>{{ section.summary }}</p>
              </aside>
            </section>
          </template>
          <div v-else class="empty-state">
            <AppIcon name="book" :size="36" />
            <h3>纲要准备好后，就可以展开内容</h3>
            <p>建议先生成一门，确认深度和表达方式。</p>
            <button class="button primary" :disabled="busy || !row.outline" @click="emit('generate', 'material')">生成这门课的材料</button>
          </div>
        </div>
        <div class="reading-content" v-if="tab === 'outline'">
          <template v-if="row.outline">
            <span class="eyebrow">COURSE OUTLINE</span>
            <h2>{{ row.outline.title || row.name }}</h2>
            <p class="lead">{{ row.outline.description }}</p>
            <div class="outline-meta">
              <section>
                <h3>前置知识</h3>
                <ul>
                  <li v-for="p in row.outline.prerequisites" :key="p">{{ p }}</li>
                </ul>
              </section>
              <section>
                <h3>学习目标</h3>
                <ul>
                  <li v-for="p in row.outline.learning_outcomes" :key="p">{{ p }}</li>
                </ul>
              </section>
            </div>
            <section v-for="(s, i) in row.outline.sections" :key="i" class="outline-section">
              <span class="row-number">{{ String(i + 1).padStart(2, '0') }}</span>
              <div>
                <h3>{{ s.title }}</h3>
                <p>{{ s.content }}</p>
                <div class="tags">
                  <span v-for="p in s.key_points" :key="p">{{ p }}</span>
                </div>
              </div>
            </section>
          </template>
          <div v-else class="empty-state">
            <h3>先为这门课搭好结构</h3>
            <button class="button primary" :disabled="busy" @click="emit('generate', 'outline')">生成课程纲要</button>
          </div>
        </div>
        <div class="reading-content" v-if="tab === 'exam'">
          <div class="section-heading">
            <div>
              <span class="eyebrow">PRACTICE & REVIEW</span>
              <h2>练习与解析</h2>
            </div>
            <button v-if="qs.length" class="text-button" :disabled="busy" @click="emit('generate', 'exam', true)">重新生成</button>
          </div>
          <p class="lead">检查题目是否覆盖学习目标。也可以作答，验证题目与解析。</p>
          <div v-if="!qs.length" class="empty-state">
            <AppIcon name="edit" :size="32" />
            <h3>还没有练习题</h3>
            <p>生成材料后，可按需补充练习。此操作会调用模型。</p>
            <button class="button primary" :disabled="busy || !row.material" @click="emit('generate', 'exam')">生成练习题</button>
          </div>
          <form v-else @submit.prevent="submitted = true">
            <fieldset v-for="(q, i) in qs" :key="i" class="question-card">
              <legend>
              <span class="row-number">{{ i + 1 }}</span>{{ q.question }}</legend>
              <p class="muted">{{ (q.correct_answers || []).length > 1 ? '多选' : '单选' }} · {{ { easy:'基础', medium:'进阶', hard:'挑战' }[q.difficulty] || '练习' }}</p>
              <label v-for="(value, key) in q.options" :key="key" class="answer-option" :class="{ correct: submitted && q.correct_answers?.includes(key) }">
                <input v-model="answers[i]" :type="q.correct_answers?.length > 1 ? 'checkbox' : 'radio'" :name="`question-${i}`" :value="key" :disabled="submitted" />
                <strong>{{ key }}</strong>
                <span>{{ value }}</span>
              </label>
              <details class="answer-explanation" :open="submitted">
                <summary>查看答案与解析</summary>
                <p>答案：{{ q.correct_answers?.join('、') }}</p>
                <p>{{ q.explanation }}</p>
              </details>
            </fieldset>
            <div class="quiz-footer">
              <span v-if="submitted" role="status">答对 {{ score }} / {{ qs.length }} 题</span>
              <button v-if="!submitted" class="button secondary" type="submit">提交练习</button>
              <button v-else class="button secondary" type="button" @click="resetQuiz">重新作答</button>
            </div>
          </form>
        </div>
      </article>
      <aside class="review-panel">
        <div class="panel-label">
          <AppIcon name="shield" />
          <h2>内容检查</h2>
        </div>
        <p>生成完成后，留一点时间确认它真正值得学习。</p>
        <ul class="review-checks">
          <li>
          <AppIcon name="check" :size="16" /> 学习目标与内容一致</li>
          <li>
          <AppIcon name="check" :size="16" /> 概念、事实与案例可靠</li>
          <li>
          <AppIcon name="check" :size="16" /> 深度、顺序和前置知识合适</li>
          <li>
          <AppIcon name="check" :size="16" /> 已生成的练习与正文匹配</li>
        </ul>
        <label class="field-label" for="review-note">审核备注 <span>需要修改时必填</span>
        </label>
        <textarea id="review-note" v-model="note" rows="4" placeholder="记录需要补充或调整的内容…" />
        <div v-if="row.review === 'stale'" class="inline-warning">内容发生变化，请检查新版本。</div>
        <button class="button primary full" :disabled="busy || !row.material" @click="emit('review', 'approved', note)">
        <AppIcon name="check" :size="17" /> 标记验收通过</button>
        <button class="button secondary full" :disabled="busy || !row.material || !note.trim()" @click="emit('review', 'changes', note)">标记需要修改</button>
        <p class="local-note">
        <AppIcon name="info" :size="14" /> 审核标记仅保存在当前浏览器。不是模型质量认证。</p>
        <details class="advanced">
          <summary>重新生成内容</summary>
          <button class="text-button" :disabled="busy" @click="emit('generate', 'outline', true)">重新生成纲要</button>
          <button class="text-button" :disabled="busy || !row.outline" @click="emit('generate', 'material', true)">重新生成材料</button>
          <p>重新生成会调用模型，并可能使下游内容需要复核。</p>
        </details>
      </aside>
    </div>
  </div>
</template>
