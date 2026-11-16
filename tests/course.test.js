import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { leafCourses, contentVersion, reviewState, parseSubjects } from '../src/utils/course.js'
import { renderMarkdown } from '../src/utils/markdown.js'
import { api, pollTasksBatch, request } from '../src/api/index.js'
import { useCourseStore } from '../src/stores/course.js'

test('leaf courses use actual children, including unclassified courses', () => {
  assert.deepEqual(leafCourses([{ _id: 'c1', name: 'A', has_subcategories: true, subcategories: [] }, { _id: 'c2', name: 'B', subcategories: [{ _id: 's1', name: 'C' }] }]).map(r => [r.id, r.type, r.parent]), [['c1', 'course', ''], ['s1', 'subcategory', 'B']])
})
test('subject input handles Chinese separators, whitespace and duplicates', () => {
  assert.deepEqual(parseSubjects(' 产品设计，统计学\n产品设计,  \nPython '), ['产品设计', '统计学', 'Python'])
})
test('review is invalidated when outline, material or exam changes', () => {
  const version = contentVersion({ title: 'A' }, { text: 'B' }, [])
  assert.equal(reviewState(undefined, version), 'pending')
  assert.equal(reviewState({ version, status: 'approved' }, version), 'approved')
  for (const changed of [contentVersion({ title: 'C' }, { text: 'B' }, []), contentVersion({ title: 'A' }, { text: 'C' }, []), contentVersion({ title: 'A' }, { text: 'B' }, ['Q'])]) assert.equal(reviewState({ version, status: 'approved' }, changed), 'stale')
})
test('content signatures do not change when JSON property order changes', () => {
  assert.equal(contentVersion({ lectureId: 'a', title: 'A', sections: [{ title: 'T', body: 'B' }] }), contentVersion({ sections: [{ body: 'B', title: 'T' }], title: 'A', lectureId: 'a' }))
})
test('Markdown escapes HTML, attributes, script schemes and code-fence content', () => {
  for (const input of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[x](javascript:alert(1))', '**<iframe src=x>**', '`<img src=x>`', '```html\n<svg onload=alert(1)>\n```']) {
    const html = renderMarkdown(input)
    assert.doesNotMatch(html, /<(?:script|img|svg|iframe)|<[^>]+(?:href|src|onerror)\s*=/i)
  }
  assert.match(renderMarkdown('## Title\n\n**Bold**\n- one\n- two\n\n```\n<code>'), /<h3>Title<\/h3>/)
  assert.match(renderMarkdown('```\n<code>'), /&lt;code&gt;/)
  assert.match(renderMarkdown('1. one\n2. two'), /<ol>/)
})
test('HTTP errors retain status and explicit server detail', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"detail":"No permission"}', { status: 403 }))
  await assert.rejects(request('GET', '/subjects'), e => e.status === 403 && e.message === 'No permission')
})
test('polling resolves partial terminal states, awaits callbacks, ignores unknown ids', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ tasks: { a: { state: 'SUCCESS', result: { value: 1 } }, b: { state: 'FAILURE', result: { error: 'bad' } }, c: { state: 'NOT_FOUND' }, other: { state: 'SUCCESS' } } })))
  const done = [], failed = []
  await pollTasksBatch(['a', 'b', 'c'].map(taskId => ({ taskId })), { interval: 0, onItem: async ({ item }) => { await Promise.resolve(); done.push(item.taskId) }, onError: ({ item }) => failed.push(item.taskId) })
  assert.deepEqual(done, ['a']); assert.deepEqual(failed, ['b', 'c'])
})
test('polling does not retry permanent HTTP errors', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{}', { status: 401 }) })
  await assert.rejects(pollTasksBatch([{ taskId: 'a' }], { interval: 0 }), /401/)
  assert.equal(calls, 1)
})
test('transient errors are bounded and missing task IDs rejected', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('Failed to fetch') })
  await assert.rejects(pollTasksBatch([{ taskId: 'a' }], { maxErrors: 3, interval: 0 }))
  assert.equal(calls, 3)
  await assert.rejects(pollTasksBatch([{}]), /任务编号/)
})
test('pending tasks have an overall deadline', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"tasks":{"a":{"state":"PENDING"}}}'))
  await assert.rejects(pollTasksBatch([{ taskId: 'a' }], { timeout: 3, interval: 2 }), /超时/)
})
test('late snapshots never replace the latest subject', async t => {
  setActivePinia(createPinia()); const store = useCourseStore()
  let release
  const snapshot = id => ({ subject: { _id: id, name: id }, courses: [], outlines: {}, materials: {}, exams: {} })
  t.mock.method(api, 'getSnapshot', id => id === 'a' ? new Promise(resolve => { release = resolve }) : Promise.resolve(snapshot(id)))
  const first = store.loadSubject('a'); await store.loadSubject('b'); release(snapshot('a')); await first
  assert.equal(store.subjectId, 'b')
})
test('demo navigation and generation never call the backend', async t => {
  setActivePinia(createPinia()); const store = useCourseStore()
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Demo must not fetch') })
  store.enterDemo(); store.home(); await store.loadSubject('demo-subject')
  assert.equal(store.courses.length, 6)
  await store.runBatch('outline', [leafCourses(store.courses)[5]])
  assert.equal(store.currentReport.done, 1); assert.equal(store.currentReport.running, false)
  assert.ok(store.outlines['course:demo-course-5'])
})
test('batch retains partial failures and successful results', async t => {
  setActivePinia(createPinia()); const store = useCourseStore(); store.subjectId = 's'; store.subjectName = 'Subject'
  t.mock.method(api, 'generateCourseContent', async id => ({ task_id: id }))
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ tasks: { a: { state: 'SUCCESS', result: { lecture_id: 'la', content: { title: 'A' } } }, b: { state: 'FAILURE', result: { error: 'Model unavailable' } } } })))
  await store.runBatch('outline', [{ id: 'a', type: 'course' }, { id: 'b', type: 'course' }])
  assert.equal(store.currentReport.done, 1); assert.equal(store.currentReport.failures.length, 1)
  assert.equal(store.currentReport.pending.length, 0); assert.ok(store.outlines['course:a'])
  assert.equal(store.isLoading('course:b'), false)
})
test('lost polling resumes known task without resubmission', async t => {
  setActivePinia(createPinia()); const store = useCourseStore(); store.subjectId = 's'; store.subjectName = 'Subject'
  let posts = 0, recovered = false
  t.mock.method(api, 'generateCourseContent', async () => { posts++; return { task_id: 'a' } })
  t.mock.method(globalThis, 'fetch', async () => recovered ? new Response('{"tasks":{"a":{"state":"SUCCESS","result":{"lecture_id":"la","content":{"title":"A"}}}}}') : new Response('{}', { status: 401 }))
  await assert.rejects(store.runBatch('outline', [{ id: 'a', type: 'course' }]))
  assert.equal(store.currentReport.uncertain, true)
  await store.runBatch('outline', [{ id: 'a', type: 'course' }]); assert.equal(posts, 1)
  recovered = true; await store.resumeBatch()
  assert.equal(posts, 1); assert.equal(store.currentReport.done, 1); assert.equal(store.currentReport.uncertain, false)
})
test('lost dispatch response stops remaining paid submissions', async t => {
  setActivePinia(createPinia()); const store = useCourseStore(); store.subjectId = 's'
  let posts = 0
  t.mock.method(api, 'generateCourseContent', async () => { posts++; throw new TypeError('Network disconnected') })
  await store.runBatch('outline', [{ id: 'a', type: 'course' }, { id: 'b', type: 'course' }])
  assert.equal(posts, 1); assert.equal(store.currentReport.uncertain, true)
  assert.equal(store.currentReport.failures.length, 0); assert.equal(store.anyWork, true)
})
