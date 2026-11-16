import { ref, watch } from 'vue'

export function useLocalReview(scope) {
  const records = ref({}), plans = ref({}), storageError = ref('')
  watch(scope, key => {
    storageError.value = ''
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      records.value = object(saved?.records); plans.value = object(saved?.plans)
    } catch { records.value = {}; plans.value = {}; storageError.value = '无法读取本地审核记录，本次标记可能无法保留。' }
  }, { immediate: true })
  function persist() {
    try { localStorage.setItem(scope.value, JSON.stringify({ records: records.value, plans: plans.value })) }
    catch { storageError.value = '浏览器无法保存审核记录；离开页面后可能丢失。' }
  }
  function save(key, version, status, note = '') { records.value[key] = { version, status, note, at: new Date().toISOString() }; persist() }
  function confirmPlan(id, signature) { plans.value[id] = signature; persist() }
  return { records, plans, storageError, save, confirmPlan }
}
