import test from 'node:test'
import assert from 'node:assert/strict'
import { setActivePinia, createPinia } from 'pinia'
import { normalizeEndpoint, canonicalJSON, sha256, deliveryLocalVersion, makeDeliveryPayload, parseCapabilities, parseDeliveryResult, deliveryRequest, DELIVERY_PROTOCOL, CAPABILITY_EXAMPLE } from '../src/utils/delivery.js'
import { useDeliveryStore, DELIVERY_STORAGE } from '../src/stores/delivery.js'

const row = () => ({ key: 'course:a', id: 'a', type: 'course', name: '课程 A', index: 0, parentId: null,
  outline: { lectureId: 'l1', title: 'A', sections: [] }, material: { materialId: 'm1', course_title: 'A', sections: [{ title: '章', body: '**内容**', summary: '摘要' }] },
  exam: [], review: 'approved', version: 'local-v1', loading: false })
const make = rows => makeDeliveryPayload({ sourceId: 'instance-a', subject: { id: 's1', name: '主题' }, rows: rows || [row()], records: { 's1:course:a': { at: '2026-11-15T00:00:00Z', note: 'PRIVATE NOTE' } }, deliveryId: 'delivery-a' })
const response = (payload, status = 'created') => ({ protocol: DELIVERY_PROTOCOL, delivery_id: payload.delivery_id,
  results: payload.courses.map(c => ({ source_key: c.source_key, content_version: c.content_version, status, target_id: 'target-a', target_status: 'draft' })) })
function setup(t, initial = {}) {
  const memory = new Map(Object.entries(initial)), previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  setActivePinia(createPinia())
  return { memory, store: useDeliveryStore() }
}

test('endpoint allows HTTPS and loopback HTTP, rejects embedded credentials and query tokens', () => {
  assert.equal(normalizeEndpoint(' https://juzhi.example/imports '), 'https://juzhi.example/imports')
  assert.equal(normalizeEndpoint('http://127.0.0.1:9001/imports'), 'http://127.0.0.1:9001/imports')
  for (const value of ['http://juzhi.example/imports', 'ftp://juzhi.example/', 'javascript:alert(1)', 'https://u:pw@juzhi.example/', 'https://juzhi.example/?token=secret', 'https://juzhi.example/#x']) assert.throws(() => normalizeEndpoint(value))
})
test('payload includes course content, hierarchy and stable version but not notes or internal material IDs', async () => {
  const payload = await make()
  assert.equal(payload.target_status, 'draft'); assert.equal(payload.scope, 'selected_courses')
  assert.equal(payload.courses[0].content_version.length, 64)
  assert.equal(payload.courses[0].outline.lectureId, undefined); assert.equal(payload.courses[0].material.materialId, undefined)
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE NOTE/)
  const sub = { ...row(), key: 'subcategory:a', type: 'subcategory', parentId: 'parent', parent: '父课程' }
  assert.deepEqual((await make([sub])).courses[0].parent, { id: 'parent', title: '父课程' })
})
test('content fingerprint ignores object property order but changes with content', async () => {
  assert.equal(canonicalJSON({ b: 1, a: { c: 2, d: 3 } }), canonicalJSON({ a: { d: 3, c: 2 }, b: 1 }))
  assert.equal(await sha256({ a: 1, b: 2 }), await sha256({ b: 2, a: 1 }))
  const first = await make(); const modified = row(); modified.material.sections[0].body = 'changed'
  assert.notEqual(first.courses[0].content_version, (await make([modified])).courses[0].content_version)
})
test('unreviewed, stale, incomplete and in-progress courses cannot enter payload', async () => {
  for (const overrides of [{ review: 'pending' }, { review: 'stale' }, { material: null }, { loading: true }, { failure: { message: 'bad' } }]) await assert.rejects(make([{ ...row(), ...overrides }]), /验收/)
  await assert.rejects(make([row(), row()]), /重复/)
})

test('local delivery receipts invalidate when title, order, hierarchy or reviewed content changes', () => {
  const original = row(), version = deliveryLocalVersion(original)
  assert.equal(version, deliveryLocalVersion({ ...original }))
  for (const overrides of [{ name: '课程新名称' }, { index: 3 }, { parentId: 'parent', parent: '新分组' }, { version: 'local-v2' }]) {
    assert.notEqual(version, deliveryLocalVersion({ ...original, ...overrides }))
  }
})
test('capability detection requires matching protocol, drafts and idempotency', () => {
  assert.deepEqual(parseCapabilities(CAPABILITY_EXAMPLE), { maxCourses: 20 })
  for (const data of [{}, { ...CAPABILITY_EXAMPLE, protocol: 'another' }, { ...CAPABILITY_EXAMPLE, capabilities: { draft_import: true } }, { ...CAPABILITY_EXAMPLE, max_courses: 0 }]) assert.throws(() => parseCapabilities(data))
})
test('only correlated final results with draft IDs count as successful', async () => {
  const payload = await make(), data = response(payload)
  assert.equal(parseDeliveryResult(data, payload)[0].status, 'created')
  for (const overrides of [{ target_id: '' }, { target_status: 'published' }, { content_version: 'wrong' }, { status: 'success' }]) {
    assert.equal(parseDeliveryResult({ ...data, results: [{ ...data.results[0], ...overrides }] }, payload)[0].status, 'unknown')
  }
  assert.equal(parseDeliveryResult({ ...data, results: [] }, payload)[0].status, 'unknown')
  assert.throws(() => parseDeliveryResult({ ...data, delivery_id: 'wrong' }, payload))
  assert.throws(() => parseDeliveryResult({ ...data, results: [data.results[0], data.results[0]] }, payload))
})
test('failed and conflict results are preserved independently', async () => {
  const payload = await make([row(), { ...row(), id: 'b', key: 'course:b' }]), data = response(payload)
  data.results[1].status = 'conflict'; data.results[1].message = '目标已人工编辑'
  assert.deepEqual(parseDeliveryResult(data, payload).map(r => r.status), ['created', 'conflict'])
})
test('connector sends JSON with idempotency header, no cookies and no redirects', async t => {
  const payload = await make()
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://juzhi.example/imports'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error')
    assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.headers.Authorization, 'Bearer TEMP')
    assert.equal(options.headers['Idempotency-Key'], payload.delivery_id)
    assert.deepEqual(JSON.parse(options.body), payload)
    return new Response(JSON.stringify(response(payload)))
  })
  await deliveryRequest('https://juzhi.example/imports', { method: 'POST', token: 'TEMP', payload })
})
test('HTTP 202, invalid JSON, auth and network errors never report success', async t => {
  for (const code of [202, 401, 500]) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: code }))
    await assert.rejects(deliveryRequest('https://juzhi.example/imports'), new RegExp(String(code)))
    mocked.mock.restore()
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>homepage</html>'))
  await assert.rejects(deliveryRequest('https://juzhi.example/imports'), /JSON/)
})
test('short-lived tokens never enter saved configuration or receipts', async t => {
  const { memory, store } = setup(t)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(CAPABILITY_EXAMPLE)))
  await store.connect('https://juzhi.example/imports', 'PRIVATE-TOKEN')
  assert.equal(store.ready, true); assert.doesNotMatch(memory.get(DELIVERY_STORAGE), /PRIVATE-TOKEN|Authorization/)
  store.connectionChanged(); assert.equal(store.ready, false)
})
test('unknown result survives reload and replay uses identical payload and request ID', async t => {
  const { memory, store } = setup(t), payload = await make(), sent = []; let recover = false
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    if (options.method === 'GET') return new Response(JSON.stringify(CAPABILITY_EXAMPLE))
    sent.push(options.body)
    if (!recover) throw new TypeError('Network lost after write')
    return new Response(JSON.stringify(response(payload)))
  })
  await store.connect('https://juzhi.example/imports', 'TEMP')
  await store.send(payload, { 'course:a': 'v1' })
  assert.ok(store.pending); assert.equal(store.history.length, 0)
  await assert.rejects(store.send(payload, {}), /上一次/)
  setActivePinia(createPinia()); const resumed = useDeliveryStore()
  assert.equal(resumed.token, ''); assert.equal(resumed.pending.payload.delivery_id, payload.delivery_id)
  recover = true; await resumed.connect('https://juzhi.example/imports', 'TEMP'); await resumed.retry()
  assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]); assert.equal(resumed.pending, null)
  assert.ok(resumed.receipt('s1', 'course:a', 'v1')); assert.equal(resumed.receipt('s1', 'course:a', 'v2'), null)
  assert.doesNotMatch(memory.get(DELIVERY_STORAGE), /Bearer|PRIVATE-TOKEN/)
})
test('storage failure prevents external POST and duplicate clicks cannot submit twice', async t => {
  const { store } = setup(t), payload = await make(); let posts = 0, resolvePost
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    if (options.method === 'GET') return new Response(JSON.stringify(CAPABILITY_EXAMPLE))
    posts++; return new Promise(resolve => { resolvePost = resolve })
  })
  await store.connect('https://juzhi.example/imports')
  const mocked = t.mock.method(localStorage, 'setItem', () => { throw new Error('Quota') })
  await assert.rejects(store.send(payload, {}), /存储/); assert.equal(posts, 0)
  mocked.mock.restore()
  const first = store.send(payload, {})
  await assert.rejects(store.send(payload, {}), /上一次/); assert.equal(posts, 1)
  resolvePost(new Response(JSON.stringify(response(payload)))); await first
  assert.equal(store.pending, null)
})
test('retry cannot silently send an old payload to a changed endpoint', async t => {
  const { store } = setup(t), payload = await make()
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    if (options.method === 'GET') return new Response(JSON.stringify(CAPABILITY_EXAMPLE))
    throw new TypeError('offline')
  })
  await store.connect('https://juzhi.example/first'); await store.send(payload, {})
  await store.connect('https://juzhi.example/second')
  await assert.rejects(store.retry(), /原请求/)
})
