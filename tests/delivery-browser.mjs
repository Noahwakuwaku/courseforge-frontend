// End-to-end test with an isolated loopback receiver, including real browser CORS.
// Course API calls are served by Vite middleware; no real data or model calls are used.
import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { createDemoSnapshot } from '../src/data/demo.js'
import { leafCourses, contentVersion, itemKey } from '../src/utils/course.js'
import { CAPABILITY_EXAMPLE, DELIVERY_PROTOCOL } from '../src/utils/delivery.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const snapshot = createDemoSnapshot()
snapshot.subject = { _id: 'sync-subject', name: '同步测试计划' }
const leaves = leafCourses(snapshot.courses)
const records = Object.fromEntries(leaves.slice(0, 2).map(row => {
  const outline = snapshot.outlines[itemKey(row)], material = snapshot.materials[outline.lectureId], exam = snapshot.exams[material.materialId]
  return [`${snapshot.subject._id}:${itemKey(row)}`, { version: contentVersion(outline, material, exam), status: 'approved', at: '2026-11-15T00:00:00Z', note: 'PRIVATE-NOTE' }]
}))
const planSignature = contentVersion(leaves.map(r => [itemKey(r), r.name, r.parent]), null, null)
const posts = [], preflights = [], cache = new Map(); let mode = 'partial', createdWrites = 0
const receiver = httpServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5174')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { preflights.push(req.headers['access-control-request-headers']); res.writeHead(204); res.end(); return }
  if (req.url === '/bad') { res.end(JSON.stringify({ ok: true })); return }
  if (req.headers.authorization !== 'Bearer TEMP-IMPORT-TOKEN') { res.writeHead(401); res.end('{}'); return }
  if (req.method === 'GET') { res.end(JSON.stringify(CAPABILITY_EXAMPLE)); return }
  let raw = ''; for await (const chunk of req) raw += chunk
  const payload = JSON.parse(raw); posts.push({ payload, raw, key: req.headers['idempotency-key'] })
  assert.equal(req.headers.cookie, undefined)
  assert.equal(payload.delivery_id, req.headers['idempotency-key'])
  assert.doesNotMatch(raw, /PRIVATE-NOTE/)
  let result = cache.get(payload.delivery_id)
  if (!result) {
    createdWrites++
    result = { protocol: DELIVERY_PROTOCOL, delivery_id: payload.delivery_id, results: payload.courses.map((c, i) => ({ source_key: c.source_key, content_version: c.content_version,
      status: mode === 'partial' && i === 1 ? 'conflict' : 'created', target_id: `draft-${c.source_id}`, target_status: 'draft', message: mode === 'partial' && i === 1 ? '测试：橘智侧已有人工修改' : '' })) }
    cache.set(payload.delivery_id, result)
  }
  if (mode === 'lost') { res.destroy(); return }
  res.end(JSON.stringify(result))
})
await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve))
const receiverUrl = `http://127.0.0.1:${receiver.address().port}`
const server = await createServer({
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  plugins: [{ name: 'isolated-course-fixture', configureServer(vite) {
    vite.middlewares.use('/api', (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/subjects') return res.end(JSON.stringify([snapshot.subject]))
      if (req.url === `/subjects/${snapshot.subject._id}/snapshot`) return res.end(JSON.stringify(snapshot))
      res.statusCode = 400; res.end(JSON.stringify({ detail: 'Real API disabled in test' }))
    })
  } }],
}); await server.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:5174/')
  await page.evaluate(({ records, planSignature, subjectId }) => localStorage.setItem('courseforge:reviews:v1:/api', JSON.stringify({ records, plans: { [subjectId]: planSignature } })), { records, planSignature, subjectId: snapshot.subject._id })
  await page.reload(); await page.locator('.plan-card').click()
  await page.getByRole('button', { name: '橘智交付', exact: true }).click()
  const save = page.getByRole('button', { name: '保存并检测接口', exact: true })
  await page.getByLabel('课程导入接口地址').fill(`${receiverUrl}/bad`); await save.click()
  await page.getByText('接口返回不符合协议。', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: /同步到橘智草稿/ }).isDisabled(), true)
  await page.getByLabel('课程导入接口地址').fill(`${receiverUrl}/imports`); await save.click()
  await page.getByText('接口返回 HTTP 401。', { exact: false }).waitFor()
  await page.locator('.sync-auth summary').click()
  await page.getByLabel('短期导入 Token（可选）').fill('TEMP-IMPORT-TOKEN'); await save.click()
  await page.locator('.sync-verified').waitFor()
  await page.getByLabel('课程导入接口地址').fill(`${receiverUrl}/other`)
  assert.equal(await page.getByLabel('短期导入 Token（可选）').inputValue(), '')
  assert.equal(await page.getByRole('button', { name: /同步到橘智草稿/ }).isDisabled(), true)
  await page.getByLabel('课程导入接口地址').fill(`${receiverUrl}/imports`)
  await page.getByLabel('短期导入 Token（可选）').fill('TEMP-IMPORT-TOKEN'); await save.click()
  await page.locator('.sync-verified').waitFor()
  assert.equal(posts.length, 0)
  await page.getByRole('button', { name: /同步到橘智草稿/ }).click()
  await page.getByRole('dialog').waitFor()
  assert.equal(posts.length, 0)
  await page.keyboard.press('Escape')
  assert.match(await page.evaluate(() => document.activeElement.textContent), /同步到橘智草稿/)
  await page.getByRole('button', { name: /同步到橘智草稿/ }).click()
  await page.getByRole('button', { name: '确认发送 2 门课程', exact: true }).click()
  await page.locator('.sync-results').getByText('版本冲突', { exact: true }).waitFor()
  assert.equal(posts.length, 1); assert.equal(posts[0].payload.courses.length, 2)
  assert.ok(preflights.some(headers => headers.includes('idempotency-key')))
  mode = 'success'
  await page.getByRole('button', { name: '选择未成功项', exact: true }).click()
  await page.getByRole('button', { name: /同步到橘智草稿/ }).click()
  await page.getByRole('button', { name: '确认发送 1 门课程', exact: true }).click()
  await page.waitForFunction(previous => {
    const label = document.querySelector('.sync-results .sync-request-id')
    return label && !label.textContent.includes(previous)
  }, posts[0].key)
  await page.locator('.sync-results').getByText('1 门已确认保存', { exact: false }).waitFor()
  assert.equal(posts.length, 2); assert.equal(posts[1].payload.courses.length, 1)
  assert.notEqual(posts[0].key, posts[1].key)
  console.log('PASS endpoint/schema/auth checks, real CORS, explicit consent, partial result and failed-only retry')

  mode = 'lost'
  await page.getByRole('button', { name: '选择全部可同步课程', exact: true }).click()
  await page.getByRole('button', { name: /同步到橘智草稿/ }).click()
  await page.getByRole('button', { name: '确认发送 2 门课程', exact: true }).click()
  await page.getByRole('heading', { name: '上一次同步结果待确认', exact: true }).waitFor()
  const before = posts.length, written = createdWrites, original = posts.at(-1).raw
  mode = 'success'
  const stored = await page.evaluate(() => localStorage.getItem('courseforge:delivery:v1:/api'))
  assert.doesNotMatch(stored, /TEMP-IMPORT-TOKEN|PRIVATE-NOTE/)
  await page.reload(); await page.locator('.plan-card').click(); await page.getByRole('button', { name: '橘智交付', exact: true }).click()
  await page.getByRole('heading', { name: '上一次同步结果待确认', exact: true }).waitFor()
  await page.locator('.sync-auth summary').click()
  assert.equal(await page.getByLabel('短期导入 Token（可选）').inputValue(), '')
  await page.getByLabel('短期导入 Token（可选）').fill('TEMP-IMPORT-TOKEN'); await save.click()
  await page.locator('.sync-verified').waitFor()
  await page.getByRole('button', { name: '使用原请求重试', exact: true }).click()
  await page.getByRole('button', { name: '确认重试原请求', exact: true }).click()
  await page.locator('.sync-results').getByText('2 门已确认保存', { exact: false }).waitFor()
  assert.equal(posts.length, before + 1); assert.equal(posts.at(-1).raw, original); assert.equal(createdWrites, written)
  assert.equal(await page.locator('.sync-pending').count(), 0)
  console.log('PASS lost response recovery after reload: same request ID/body, receiver writes once, tokens not persisted')

  await page.evaluate(() => window.scrollTo(0, 0))
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/delivery-connected.png`, fullPage: true })
  await page.getByRole('button', { name: '查看接口字段与 JSON 示例', exact: false }).click()
  await page.getByText('1. GET 连接检测返回', { exact: true }).click()
  await page.getByText('2. POST 导入请求', { exact: true }).click()
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 1500 })
    if (width === 390 && process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/delivery-fields-mobile.png`, fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log('PASS API field tables and JSON examples at 1280/768/390/320px; zero page errors')
} finally { await browser?.close(); await server.close(); await new Promise(resolve => receiver.close(resolve)) }
