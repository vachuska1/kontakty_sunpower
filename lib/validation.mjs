// Historical records without IDs remain valid and unchanged until explicitly edited.
// New records created in the UI always receive their own UUID.
export function validateContacts(contacts) {
  if (!Array.isArray(contacts) || contacts.length > 5000) return 'Neplatná data kontaktů'
  const ids = new Set()
  for (const c of contacts) {
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id.trim() || ids.has(c.id) || !Array.isArray(c.history)) return 'Neplatné ID nebo historie kontaktu'
    ids.add(c.id)
    const historyIds = new Set()
    for (const h of c.history) {
      if (!h || typeof h !== 'object' || Array.isArray(h) || (h.id && (typeof h.id !== 'string' || historyIds.has(h.id)))) return 'Neplatné ID hovoru'
      if (h.id) historyIds.add(h.id)
    }
  }
  return null
}
