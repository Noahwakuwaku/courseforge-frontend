// Intentionally supports a small, safe Markdown subset. Source HTML is always
// escaped. No raw HTML, URL attributes, or executable embeds are emitted.
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function inline(value) {
  return escapeHtml(value).split(/(`[^`]+`)/g).map(part => part.startsWith('`')
    ? `<code>${part.slice(1, -1)}</code>`
    : part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')).join('')
}
export function renderMarkdown(value) {
  const lines = String(value ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let code = null, paragraph = [], list = null
  const flush = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = [] } }
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flush(); closeList()
      if (code !== null) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null } else code = []
      continue
    }
    if (code !== null) { code.push(line); continue }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const bullet = line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/)
    if (heading) { flush(); closeList(); const level = Math.min(heading[1].length + 1, 6); out.push(`<h${level}>${inline(heading[2])}</h${level}>`) }
    else if (bullet) { flush(); const type = bullet[1] ? 'ul' : 'ol'; if (list !== type) { closeList(); list = type; out.push(`<${type}>`) } out.push(`<li>${inline(bullet[2])}</li>`) }
    else if (/^>\s?/.test(line)) { flush(); closeList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`) }
    else if (!line.trim()) { flush(); closeList() }
    else { closeList(); paragraph.push(line) }
  }
  flush(); closeList()
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}
