export const newId = () => globalThis.crypto.randomUUID()
export function migrate(contacts) {
  const used = new Set(), historyIds = new Set()
  return contacts.map(c => {
    let id = c.id
    if (!id || used.has(id)) id = newId()
    used.add(id)
    const history = (c.history || []).map(h => {
      let hid = h.id
      if (!hid || historyIds.has(hid)) hid = newId()
      historyIds.add(hid)
      return { ...h, id: hid }
    })
    if (!c.historyMigrated && (c.note || c.followUp) && !history.some(h => (h.note || '') === (c.note || '') && (h.at || '') === (c.calledAt || ''))) {
      history.push({ id: newId(), at: c.calledAt || '', status: c.status || 'new', note: c.note || '', followUp: c.followUp || '', legacy: true })
    }
    return { ...c, id, history, historyMigrated: true }
  })
}
export function scheduled(contact) {
  const entries = contact.history || []
  const latest = [...entries].filter(h => !h.legacy && h.status !== 'started').sort((a,b) => String(b.at).localeCompare(String(a.at)))[0]
  // A subsequent completed call resolves reminders from earlier calls.
  const candidates = entries.filter(h => h.followUp && (!latest || !h.at || h.at >= latest.at)).map(h=>h.followUp)
  if (!entries.some(h => Object.hasOwn(h, 'followUp')) && contact.followUp) candidates.push(contact.followUp)
  return candidates.sort()[0] || ''
}
export function scheduleGroup(value, now = new Date()) {
  if (!value) return ''
  const pad = n => String(n).padStart(2,'0')
  const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const parsed = new Date(value)
  const date = value.length === 10 ? value : `${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}`
  return date < today ? 'overdue' : date === today ? 'today' : 'future'
}
export function updateHistory(contact, history) {
  const latest = [...history].filter(h=>!h.legacy && h.status !== 'started').sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0]
  const result = { ...contact, history }
  if (latest) { result.status = latest.status || contact.status; result.calledAt = latest.at || contact.calledAt }
  result.followUp = scheduled(result)
  return result
}
export function mergeImport(existing, incoming, merge = false) {
  const result = [...existing]
  for (const source of incoming) {
    const key = String(source.phone || '').replace(/\D/g,'').slice(-9)
    const index = result.findIndex(c => (source.id && c.id === source.id) || (key && String(c.phone || '').replace(/\D/g,'').slice(-9) === key))
    if (index < 0) { result.push(...migrate([{ ...source, id: source.id || newId() }])); continue }
    if (!merge) continue
    const target = result[index]
    const history = [...(target.history || [])]
    for (const h of source.history || []) {
      if (!history.some(x => (x.id && x.id === h.id) || (x.at === h.at && (x.note || '') === (h.note || '') && x.status === h.status && (x.followUp || '') === (h.followUp || '')))) history.push({ ...h, id: newId() })
    }
    const fields = Object.fromEntries(Object.entries(source).filter(([k,v]) => !['id','history'].includes(k) && v !== '' && v != null))
    result[index] = { ...target, ...fields, history }
  }
  return result
}
