// Optional browser tests: uses installed Chrome and a locally available Playwright.
// All API calls are intercepted; no model services or real data are used.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { demoContent } from '../src/data/demo.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } })
await server.listen()
let browser
const errors = [], checkpoints = []
const check = name => { checkpoints.push(name); console.log(`PASS ${name}`) }
async function screenshot(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true })
}
async function waitText(page, selector, text) { await page.locator(selector).filter({ hasText: text }).first().waitFor() }
async function fits(page, label) {
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 1500 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflows`)
}
try {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  let apiCalls = 0
  await page.route('**/*', route => {
    if (new URL(route.request().url()).pathname.startsWith('/api/')) { apiCalls++; return route.fulfill({ status: 503, json: { detail: 'Test: unavailable' } }) }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5174/?demo=1')
  await page.getByRole('heading', { name: /产品设计基础/ }).waitFor()
  await screenshot(page, 'course-workspace')
  await page.getByRole('button', { name: '确认课程计划', exact: true }).click()
  await page.getByRole('button', { name: '检查样本课程', exact: true }).click()
  await page.getByRole('button', { name: '标记验收通过', exact: true }).click()
  await waitText(page, '.reader-heading .badge', '已验收')
  await screenshot(page, 'course-review')
  await page.getByRole('button', { name: '练习与解析', exact: true }).click()
  await page.locator('input[name="question-0"][value="B"]').check()
  for (const value of ['A', 'B', 'D']) await page.locator(`input[name="question-1"][value="${value}"]`).check()
  await page.getByRole('button', { name: '提交练习', exact: true }).click()
  await waitText(page, '.quiz-footer', '答对 2 / 2')
  await page.getByRole('button', { name: '重新作答', exact: true }).click()
  assert.equal(await page.locator('.question-card input:checked').count(), 0)
  check('demo review persistence and single/multiple-choice grading')
  await page.getByRole('button', { name: '返回课程计划', exact: true }).click()
  await page.reload()
  await waitText(page, '.course-row', '已验收')
  await page.getByRole('button', { name: /生成剩余纲要/ }).click()
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await waitText(page, '.batch-report', '成功 2 / 2')
  await page.getByRole('button', { name: /生成剩余材料/ }).click()
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await waitText(page, '.batch-report', '成功 4 / 4')
  await page.getByRole('button', { name: '橘智交付', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /同步到橘智草稿/ }).isDisabled(), true)
  await screenshot(page, 'course-delivery')
  assert.equal(await page.getByRole('button', { name: '保存并检测接口', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '查看接口字段与 JSON 示例', exact: false }).click()
  await page.getByRole('cell', { name: 'delivery_id', exact: true }).waitFor()
  await page.getByRole('button', { name: '收起接口字段', exact: false }).click()
  assert.equal(apiCalls, 0)
  check('guided demo flow and external sync disabled in demo, visible API contract')
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await screenshot(page, 'course-home')
  await page.locator('.plan-card').first().click()
  await page.getByRole('heading', { name: /产品设计基础/ }).waitFor()
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await fits(page, `${width}px course list`)
    if (width === 390) await screenshot(page, 'course-mobile')
  }
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '橘智交付', exact: true }).click()
  await fits(page, 'mobile delivery')
  await page.getByRole('button', { name: '返回内容检查' }).click()
  await page.locator('.course-name').first().click()
  await fits(page, 'mobile reader')
  check('1280/768/390/320px layouts, drawer navigation, reader and delivery')
  assert.equal(apiCalls, 0)

  // A fresh context exercises the real frontend API path against an isolated fixture.
  const real = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const live = await real.newPage(); live.on('pageerror', e => errors.push(e.message))
  const snapshot = { subject: { _id: 'subject-a', name: '接口测试课程' }, courses: [{ _id: 'a', name: '父课程', has_subcategories: true, subcategories: [{ _id: 'sub-a', name: '子课程 A' }] }, { _id: 'b', name: '课程 B', has_subcategories: false }], outlines: {}, materials: {}, exams: {} }
  const dispatches = [], attempts = {}; let creates = 0
  await live.route('**/*', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const ok = value => route.fulfill({ json: value })
    if (path === '/api/subjects') {
      if (req.method() === 'POST') { creates++; return route.fulfill({ status: 400, json: { detail: '测试：主题需要更明确' } }) }
      return ok([snapshot.subject])
    }
    if (path.endsWith('/snapshot')) return ok(snapshot)
    if (path.endsWith('/content')) {
      dispatches.push(path); const id = path.split('/')[3]; attempts[id] = (attempts[id] || 0) + 1
      return ok({ task_id: `${id}-${attempts[id]}` })
    }
    if (path === '/api/tasks/batch') {
      const tasks = {}
      for (const id of req.postDataJSON().task_ids) {
        if (id === 'b-1') tasks[id] = { state: 'FAILURE', result: { error: '测试：模型暂不可用' } }
        else {
          const content = demoContent('模拟课程').outline, key = id.startsWith('sub-a') ? 'subcategory:sub-a' : 'course:b'
          const result = { content, lecture_id: `lecture-${id}` }
          snapshot.outlines[key] = { lectureId: result.lecture_id, ...content }
          tasks[id] = { state: 'SUCCESS', result }
        }
      }
      return ok({ tasks })
    }
    return route.fulfill({ status: 404, json: { detail: `Unexpected test route: ${path}` } })
  })
  await live.goto('http://127.0.0.1:5174/')
  await live.locator('.plan-card').click()
  await live.getByRole('checkbox', { name: '全选当前筛选课程' }).check()
  await live.locator('.selection-bar').getByRole('button', { name: '生成纲要', exact: true }).click()
  await live.getByRole('button', { name: '开始生成', exact: true }).click()
  await waitText(live, '.batch-report', '失败 1')
  assert.equal(dispatches.length, 2)
  assert.ok(dispatches.includes('/api/subcategories/sub-a/content'))
  await live.getByRole('button', { name: '重试失败项', exact: true }).click()
  assert.equal(await live.locator('.generation-scope li').count(), 1)
  await live.getByRole('button', { name: '开始生成', exact: true }).click()
  await waitText(live, '.batch-report', '成功 1 / 1')
  assert.equal(dispatches.length, 3); assert.equal(dispatches[2], '/api/courses/b/content')
  check('real API adapter: subcategory routing, partial failure and retry only failed item')
  await live.getByRole('button', { name: '新建课程计划', exact: true }).click()
  await live.getByLabel('你想准备什么课程？').fill('保留我的主题')
  await live.getByRole('button', { name: '生成课程计划', exact: true }).click()
  await waitText(live, 'dialog', '未能创建')
  assert.equal(await live.getByLabel('你想准备什么课程？').inputValue(), '保留我的主题')
  assert.equal(creates, 1)
  await live.keyboard.press('Escape')
  check('creation failure preserves user input and dismissible modal')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ checkpoints: checkpoints.length, pageErrors: errors }))
} finally { await browser?.close(); await server.close() }
