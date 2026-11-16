export const itemKey = (item) => `${item.type}:${item.id}`

export function leafCourses(courses) {
  return courses.flatMap(course => course.subcategories?.length
    ? course.subcategories.map(sub => ({ ...sub, id: sub._id, type: 'subcategory', parent: course.name, parentId: course._id }))
    : [{ ...course, id: course._id, type: 'course', parent: '', parentId: null }])
}

// A local change detector, not a server-side signature or a quality score.
export function contentVersion(outline, material, exam) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
  const text = JSON.stringify(stable([outline || null, material || null, exam || null]))
  let a = 2166136261
  let b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return `${text.length}-${a >>> 0}-${b >>> 0}`
}

export function reviewState(record, version) {
  if (!record) return 'pending'
  if (record.version !== version) return 'stale'
  return record.status
}

export function nextStage(rows) {
  if (!rows.length || rows.some(r => !r.outline)) return 'outline'
  if (rows.some(r => !r.material)) return 'material'
  return 'review'
}

export function parseSubjects(value) {
  return [...new Set(value.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean))]
}
