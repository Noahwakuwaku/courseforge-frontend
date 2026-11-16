<script setup>
import { computed, ref, watch } from 'vue'
import { useDeliveryStore } from '../stores/delivery.js'
import { DELIVERY_PROTOCOL, deliveryLocalVersion, makeDeliveryPayload, CAPABILITY_EXAMPLE, REQUEST_EXAMPLE, RESPONSE_EXAMPLE, RESULT_LABELS, SUCCESS_STATUSES } from '../utils/delivery.js'
import AppIcon from './AppIcon.vue'
import AppDialog from './AppDialog.vue'
import '../styles/delivery.css'

const props = defineProps({ rows: Array, subjectId: String, subjectName: String, records: Object, planned: Boolean, blocked: Boolean, demo: Boolean })
const emit = defineEmits(['review'])
const sync = useDeliveryStore()
const address = ref(sync.endpoint), secret = ref(sync.token), selected = ref([]), preview = ref(null), retryConfirm = ref(false)
const error = ref(''), copyNotice = ref(''), preparing = ref(false), showContract = ref(false)
const eligible = computed(() => props.rows.filter(r => r.material && r.outline && r.review === 'approved' && !r.loading && !r.failure))
const selectedRows = computed(() => eligible.value.filter(r => selected.value.includes(r.key)))
const working = computed(() => sync.busy || sync.connection === 'checking' || preparing.value)
const compatible = computed(() => sync.ready && address.value.trim() === sync.endpoint && secret.value === sync.token)
const receipts = computed(() => props.demo ? [] : sync.history.filter(e => e.subjectId === props.subjectId && e.endpoint === sync.endpoint))
const latest = computed(() => receipts.value[0])
const connectionText = computed(() => ({ idle: sync.endpoint ? '地址已保存 · 待检测' : '填写接收接口', checking: '正在检测接口', ready: '接口协议已验证', failed: '连接检测未通过' }[sync.connection]))
const canSend = computed(() => !props.demo && !props.blocked && props.planned && compatible.value && selectedRows.value.length > 0 && !working.value && !sync.pending)
const pendingHere = computed(() => !props.demo && sync.pending)
const pretty = value => JSON.stringify(value, null, 2)
const receiptFor = row => props.demo ? null : sync.receipt(props.subjectId, row.key, deliveryLocalVersion(row))
watch([() => props.subjectId, () => sync.endpoint, () => props.rows.map(r => `${r.review}:${deliveryLocalVersion(r)}`).join('|')], () => {
  selected.value = eligible.value.filter(r => !receiptFor(r)).map(r => r.key)
  preview.value = null
}, { immediate: true })

async function connect() {
  if (props.demo) return
  error.value = ''
  await sync.connect(address.value, secret.value)
  if (sync.ready) { address.value = sync.endpoint; secret.value = sync.token }
}
function changed() { sync.connectionChanged(); preview.value = null }
function endpointChanged() { secret.value = ''; sync.token = ''; changed() }
async function prepare() {
  if (!canSend.value) return
  error.value = ''; preparing.value = true
  try {
    if (selectedRows.value.length > sync.maxCourses) throw new Error(`接口每次最多接收 ${sync.maxCourses} 门，请缩小选择范围。`)
    const payload = await makeDeliveryPayload({ sourceId: sync.sourceId, subject: { id: props.subjectId, name: props.subjectName }, rows: selectedRows.value, records: props.records })
    preview.value = { endpoint: sync.endpoint, payload, versions: Object.fromEntries(selectedRows.value.map(r => [r.key, deliveryLocalVersion(r)])) }
  } catch (e) { error.value = e.message } finally { preparing.value = false }
}
async function confirmSend() {
  const draft = preview.value
  if (!draft || !canSend.value || draft.endpoint !== sync.endpoint) return
  error.value = ''
  try {
    const current = props.rows.filter(r => draft.payload.courses.some(c => c.source_key === r.key))
    const checked = await makeDeliveryPayload({ sourceId: sync.sourceId, subject: { id: props.subjectId, name: props.subjectName }, rows: current, records: props.records, deliveryId: draft.payload.delivery_id })
    if (pretty(checked.courses) !== pretty(draft.payload.courses)) throw new Error('确认期间课程或审核发生变化，请重新选择同步范围。')
    preview.value = null
    await sync.send(draft.payload, draft.versions)
    selected.value = selected.value.filter(key => !SUCCESS_STATUSES.includes(latest.value?.results.find(r => r.source_key === key)?.status))
  } catch (e) { preview.value = null; error.value = e.message }
}
async function retry() {
  retryConfirm.value = false; error.value = ''
  try {
    await sync.retry()
    selected.value = selected.value.filter(key => !SUCCESS_STATUSES.includes(latest.value?.results.find(r => r.source_key === key)?.status))
  } catch (e) { error.value = e.message }
}
function selectFailures() {
  selected.value = eligible.value.filter(r => latest.value?.results.some(item => item.source_key === r.key && ['failed', 'conflict'].includes(item.status))).map(r => r.key)
}
async function copy(value) {
  try { await navigator.clipboard.writeText(pretty(value)); copyNotice.value = '已复制 JSON 示例。' }
  catch { copyNotice.value = '浏览器不允许自动复制，请从代码框手动选择并复制。' }
}
const fields = [
  ['protocol', '固定协议标识', DELIVERY_PROTOCOL],
  ['delivery_id', '请求 UUID', '与 Idempotency-Key 请求头一致；原请求重试保持不变'],
  ['source_instance_id', '来源实例 UUID', '区分不同 CourseForge 实例，保存在本浏览器'],
  ['target_status / scope', '固定值', 'draft / selected_courses；只创建或更新所选课程的草稿'],
  ['subject', 'id、name', '课程计划的来源 ID 与名称'],
  ['courses[].source_key', '类型:ID', '如 course:123 或 subcategory:456；稳定的课程标识'],
  ['courses[].source_id / source_type', '来源 ID / 类型', 'course 或 subcategory'],
  ['courses[].title / position / parent', '标题 / 顺序 / 父级', 'position 从 0 开始；parent 为 null 或 {id,title}'],
  ['courses[].content_version', 'SHA-256', '对课程内容字段做稳定 JSON 序列化后计算，详见协议文件'],
  ['courses[].outline', '课程纲要对象', 'title、description、prerequisites[]、learning_outcomes[]、sections[]'],
  ['courses[].material', '学习材料对象', 'course_title、sections[{title,body,summary}]；body 为 Markdown'],
  ['courses[].questions', '练习数组，可为空', 'question、options、correct_answers[]、explanation、difficulty'],
  ['courses[].review', '审核信息', 'status=approved、reviewed_at、method=browser_local_manual'],
]
</script>

<template>
  <section class="delivery-page sync-page">
    <div class="page-heading">
      <div><div class="eyebrow">CONNECT · IMPORT · VERIFY</div><h1>把好内容，同步到橘智</h1><p>按接口约定接收课程，填写地址后，将已验收内容送入草稿区。</p></div>
      <span class="badge" :class="compatible && !demo ? 'green' : 'neutral'">{{ demo ? '示例模式 · 不发送数据' : connectionText }}</span>
    </div>
    <div class="sync-steps"><span><b>1</b> 对照接口字段</span><AppIcon name="chevron" :size="15" /><span><b>2</b> 填写地址并检测</span><AppIcon name="chevron" :size="15" /><span><b>3</b> 确认范围并同步</span></div>
    <div v-if="error" class="message error" role="alert">{{ error }}</div>
    <div v-if="!demo && sync.storageError" class="message warning" role="alert">{{ sync.storageError }}</div>

    <div class="sync-setup-grid">
      <article class="sync-card connection-form">
        <div class="section-heading"><div><span class="eyebrow">DESTINATION</span><h2>连接你的接收接口</h2></div><span class="orange-monogram">橘</span></div>
        <form @submit.prevent="connect">
          <label class="field-label" for="sync-endpoint">课程导入接口地址</label>
          <input id="sync-endpoint" v-model="address" type="url" placeholder="https://你的域名/api/courseforge/imports" autocomplete="off" :disabled="working || demo" @input="endpointChanged" required />
          <p class="field-help">同一地址支持 GET 检测与 POST 导入。请填写 API 地址，不是网站首页。</p>
          <details class="sync-auth"><summary>访问令牌 <span>接口需要鉴权时填写</span></summary>
            <label class="field-label" for="sync-token">短期导入 Token（可选）</label>
            <input id="sync-token" v-model="secret" type="password" autocomplete="new-password" placeholder="仅限该接收接口的短期令牌" :disabled="working || demo" @input="changed" />
            <p class="field-help">仅保留在本次页面内存，不写入浏览器存储。刷新或修改接口地址后需重新填写；不要填写模型 API Key、数据库密码或长期管理员密钥。</p>
          </details>
          <button class="button secondary full" type="submit" :disabled="working || demo || !address.trim()"><span v-if="sync.connection === 'checking' && !demo" class="spinner" /><AppIcon v-else name="cloud" :size="17" />{{ sync.connection === 'checking' && !demo ? '正在检测…' : '保存并检测接口' }}</button>
        </form>
        <p v-if="!demo && sync.connectionError" class="inline-warning" role="alert">{{ sync.connectionError }}</p>
        <p v-if="compatible && !demo" class="sync-verified" role="status"><AppIcon name="check" :size="16" /> 协议验证通过 · 每次最多 {{ sync.maxCourses }} 门；检测操作不会发送课程。</p>
        <div class="quiet-note">检测只读取接口能力，不发送课程。真正同步前会展示目标地址和完整数据，由你确认后再发送。</div>
      </article>

      <article class="sync-card sync-overview">
        <span class="eyebrow">READY TO DELIVER</span><h2>{{ subjectName }}</h2>
        <div class="sync-number"><strong>{{ eligible.length }}</strong><span>/ {{ rows.length }} 门可同步</span></div>
        <p>只有当前版本已验收，且具备纲要和学习材料的课程才能同步。练习可选。</p>
        <ul class="sync-requirements"><li><AppIcon :name="planned ? 'check' : 'info'" :size="16" />{{ planned ? '课程结构已在本浏览器确认' : '请先返回课程计划确认结构' }}</li><li><AppIcon name="shield" :size="16" /> 同步为草稿，不自动公开发布</li><li><AppIcon name="refresh" :size="16" /> 接口需按请求编号和课程版本去重</li></ul>
        <button class="text-button" @click="showContract = !showContract">{{ showContract ? '收起接口字段' : '查看接口字段与 JSON 示例' }}<AppIcon name="down" :size="16" /></button>
        <button class="text-button" @click="emit('review')">返回内容检查<AppIcon name="arrow" :size="16" /></button>
      </article>
    </div>

    <article class="sync-card sync-contract">
      <button class="contract-toggle" :aria-expanded="showContract" @click="showContract = !showContract"><span><AppIcon name="layers" :size="19" /> 接收端需要实现什么？</span><span>字段、请求与返回示例<AppIcon :name="showContract ? 'close' : 'down'" :size="17" /></span></button>
      <div v-if="showContract" class="contract-body">
        <p>填写链接即可同步的前提：接收端实现以下协议。这里只发送已生成的课程，不触发模型生成；也不会自动创建对方的 API。</p>
        <p class="field-help">以下字段由系统自动填写。窄屏可左右滑动表格，查看完整约定。</p>
        <div class="protocol-table-wrap"><table class="protocol-table"><caption>POST 请求字段（均由 CourseForge 自动组装）</caption><thead><tr><th>字段</th><th>类型 / 含义</th><th>约定</th></tr></thead><tbody><tr v-for="field in fields" :key="field[0]"><td><code>{{ field[0] }}</code></td><td>{{ field[1] }}</td><td>{{ field[2] }}</td></tr></tbody></table></div>
        <details class="json-example"><summary>1. GET 连接检测返回</summary><button class="text-button" @click="copy(CAPABILITY_EXAMPLE)">复制示例</button><pre>{{ pretty(CAPABILITY_EXAMPLE) }}</pre></details>
        <details class="json-example"><summary>2. POST 导入请求</summary><p>请求头：Content-Type: application/json；Idempotency-Key: delivery_id；可选 Authorization: Bearer 短期令牌。</p><button class="text-button" @click="copy(REQUEST_EXAMPLE)">复制示例</button><pre>{{ pretty(REQUEST_EXAMPLE) }}</pre></details>
        <details class="json-example"><summary>3. POST 导入返回（HTTP 200 / 201）</summary><p>每门课程须返回同一 source_key、content_version；状态为 created / updated / unchanged / failed / conflict。成功还须提供 target_id 和 target_status=draft。HTTP 202 或缺少结果不算同步成功。</p><button class="text-button" @click="copy(RESPONSE_EXAMPLE)">复制示例</button><pre>{{ pretty(RESPONSE_EXAMPLE) }}</pre></details>
        <p v-if="copyNotice" role="status">{{ copyNotice }}</p>
        <div class="form-note">跨域时，接收端需响应 OPTIONS，允许本工作台的 Origin、GET / POST / OPTIONS，以及 Content-Type、Authorization、Idempotency-Key 请求头。令牌与权限在接收端校验；浏览器审核标记不等于可信鉴权。</div>
        <p class="field-help">完整协议文件：docs/JUZHI_SYNC_API.zh-CN.md。正式部署使用 HTTPS；URL 不接受密钥参数，不携带浏览器 Cookie，不跟随重定向。</p>
      </div>
    </article>

    <article v-if="pendingHere" class="sync-card sync-pending" role="status">
      <h2>{{ sync.busy ? '正在同步，请等待接收端确认' : '上一次同步结果待确认' }}</h2>
      <p>计划：{{ sync.pending.payload.subject.name }} · {{ sync.pending.payload.courses.length }} 门</p>
      <p class="endpoint-copy">目标：{{ sync.pending.endpoint }}</p><p class="sync-request-id">请求编号：{{ sync.pending.payload.delivery_id }}</p>
      <p v-if="sync.pending.error">{{ sync.pending.error }}</p>
      <p>请求编号和原内容已保存在本浏览器。重试使用同一请求，不重生成课程；接收端必须幂等处理，避免重复建课。</p>
      <button class="button secondary" :disabled="working || !compatible || sync.endpoint !== sync.pending.endpoint" @click="retryConfirm = true">使用原请求重试</button>
      <p v-if="!compatible || sync.endpoint !== sync.pending.endpoint" class="field-help">先在上方填写原目标地址和必要令牌，并检测连接。待确认请求处理完之前不会另发新批次。</p>
    </article>

    <article class="sync-card sync-scope">
      <div class="section-heading"><div><h2>选择本次同步范围</h2><p>默认选择尚未同步的已验收版本。不会删除橘智中已有的其他课程。</p></div><button class="text-button" :disabled="working" @click="selected = selected.length ? [] : eligible.map(r => r.key)">{{ selected.length ? '取消选择' : '选择全部可同步课程' }}</button></div>
      <div v-if="!eligible.length" class="empty-state compact"><AppIcon name="shield" :size="28" /><h3>先检查一门课程，再开始交付</h3><p>目前没有满足条件的已验收课程。</p><button class="button secondary" @click="emit('review')">去检查内容</button></div>
      <label v-for="row in eligible" :key="row.key" class="sync-course"><input v-model="selected" type="checkbox" :value="row.key" :disabled="working" :aria-label="`同步${row.name}`" /><span><strong>{{ row.name }}</strong><small>{{ row.material.sections?.length || 0 }} 个章节 · {{ row.exam?.length || 0 }} 道练习</small></span><span class="badge" :class="receiptFor(row) ? 'green' : 'neutral'">{{ receiptFor(row) ? '此版本已同步' : '待同步' }}</span></label>
      <div class="sync-submit"><div><strong>已选 {{ selectedRows.length }} 门</strong><p>{{ demo ? '示例模式只展示配置和字段，不允许向外部发送。' : !planned ? '请先确认课程结构。' : !compatible ? '请先保存并检测接收接口。' : blocked ? '当前生成任务尚未结束或结果待确认。' : sync.pending ? '请先确认上一批的同步结果。' : '发送纲要、正文与可选练习，不发送审核备注或模型密钥。' }}</p></div><button class="button primary" :disabled="!canSend" @click="prepare"><AppIcon name="cloud" :size="18" />同步到橘智草稿 · {{ selectedRows.length }}</button></div>
    </article>

    <article v-if="latest" class="sync-card sync-results" aria-live="polite">
      <div class="section-heading"><div><h2>最近一次同步结果</h2><p>{{ latest.results.filter(r => SUCCESS_STATUSES.includes(r.status)).length }} 门已确认保存 · 以接收端逐项返回为准</p></div><button v-if="latest.results.some(r => ['failed','conflict'].includes(r.status)) && !sync.pending" class="text-button" @click="selectFailures">选择未成功项</button></div>
      <p class="sync-request-id">请求编号：{{ latest.id }}</p>
      <div v-for="result in latest.results" :key="result.source_key" class="sync-result"><div><strong>{{ result.title }}</strong><p v-if="result.target_id">橘智草稿 ID：{{ result.target_id }}</p><p v-if="result.message">{{ result.message }}</p></div><span class="badge" :class="SUCCESS_STATUSES.includes(result.status) ? 'green' : result.status === 'unknown' ? 'orange' : 'red'">{{ RESULT_LABELS[result.status] }}</span></div>
      <p class="field-help">此浏览器保留最近 20 次请求结果。新版本的同步会重新核对内容指纹；清理浏览器数据会丢失本地来源标识与记录，请先备份并核对接收端映射。</p>
    </article>

    <AppDialog v-if="preview" title="确认发送到橘智" @close="preview = null">
      <div class="dialog-body"><p class="dialog-intro">将所选课程的纲要、完整正文、练习和本地验收时间发送到以下地址，并创建或更新草稿。</p><p class="sync-confirm-target">{{ preview.endpoint }}</p><ul class="generation-scope"><li v-for="course in preview.payload.courses" :key="course.source_key">{{ course.title }}</li></ul><details class="json-example"><summary>查看本次完整发送数据</summary><pre>{{ pretty(preview.payload) }}</pre></details><div class="form-note">只同步当前选中版本，不自动发布、不删除其他课程、不调用模型。为支持断线恢复，发送前会在本浏览器暂存本批内容与请求编号，确认结果后仅保留回执。请确认这个接口由你或你信任的接收方控制。</div><div class="dialog-actions"><button class="button secondary" @click="preview = null">返回调整</button><button class="button primary" :disabled="!canSend" @click="confirmSend">确认发送 {{ preview.payload.courses.length }} 门课程</button></div></div>
    </AppDialog>
    <AppDialog v-if="retryConfirm && pendingHere" title="确认重试原请求" @close="retryConfirm = false">
      <div class="dialog-body"><p class="dialog-intro">将原封不动重发上次的 {{ sync.pending.payload.courses.length }} 门课程及相同请求编号。此操作用于确认未知结果；课程可能已经被接收端保存。</p><p class="sync-confirm-target">{{ sync.pending.endpoint }}</p><p class="field-help">即使当前课程已修改，重试发送的仍是上次确认的版本。接收端按请求编号返回原结果，不应重复导入。</p><div class="dialog-actions"><button class="button secondary" @click="retryConfirm = false">取消</button><button class="button primary" :disabled="working || !compatible" @click="retry">确认重试原请求</button></div></div>
    </AppDialog>
  </section>
</template>
