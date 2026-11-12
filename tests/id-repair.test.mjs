import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { validateContacts } from '../lib/validation.mjs'
import { prepareRepair, verifyRepair, counts } from '../scripts/repair-empty-ids.mjs'
const hash=b=>createHash('sha256').update(b).digest('hex')
const bytes=readFileSync('backups/live-contacts-before-id-repair-2026-10-16.json')
const live=JSON.parse(bytes)
test('full live backup matches manifest and independent array, without exposing contact data',()=>{
 const manifest=JSON.parse(readFileSync('backups/live-contacts-backup-manifest-2026-10-16.json'))
 for(const f of manifest.files)assert.equal(hash(readFileSync(f.path)),f.sha256)
 assert.ok(isDeepStrictEqual(live.contacts,JSON.parse(readFileSync('backups/live-contacts-array-before-id-repair-2026-10-16.json'))))
 assert.equal(counts(live.contacts).contacts,178);assert.equal(counts(live.contacts).emptyIds,14);assert.equal(counts(live.contacts).historyRecords,209)
 const affected=live.contacts.filter(c=>!c.id)
 assert.ok(affected.every(c=>c.status==='no-answer'&&c.calledAt==='2026-10-16T08:12:12.997Z'&&c.history.length===8))
 assert.ok(affected.every(c=>isDeepStrictEqual(c.history,affected[0].history)))
})
test('dry-run changes exactly 14 ID fields, preserves every other field and all response metadata',()=>{
 const before=structuredClone(live), {result,report}=prepareRepair(live,hash(bytes))
 assert.equal(report.changedFields,14);assert.equal(report.after.emptyIds,0);assert.equal(report.after.duplicateIds,0)
 assert.equal(report.after.historyRecords,209);assert.equal(report.after.contacts,178)
 assert.ok(isDeepStrictEqual(live,before),'Input snapshot mutated')
 assert.ok(isDeepStrictEqual(JSON.parse(readFileSync('backups/live-contacts-id-repair-prepared-2026-10-16.json')),result),'Prepared artifact differs')
 assert.ok(isDeepStrictEqual(prepareRepair(live,hash(bytes)).result,result),'IDs are not stable')
 assert.ok(isDeepStrictEqual(prepareRepair(result,hash(bytes)).result,result),'Migration is not idempotent')
 for(let i=0;i<178;i++){
  const {id:oldId,...oldFields}=live.contacts[i],{id:newId,...newFields}=result.contacts[i]
  assert.ok(isDeepStrictEqual(oldFields,newFields),`Non-ID field changed at index ${i}`)
  if(oldId)assert.equal(newId,oldId)
 }
})
test('verification rejects changed notes, modified/deleted history, reordering and metadata changes',()=>{
 const {result}=prepareRepair(live,hash(bytes))
 for(const mutate of [r=>r.contacts[0].note='changed',r=>r.contacts.find(c=>c.history.length).history.pop(),r=>r.contacts.reverse(),r=>r.updatedAt='changed']) {
  const changed=structuredClone(result);mutate(changed);assert.throws(()=>verifyRepair(live,changed))
 }
})

test('API accepts ID-only repaired data with unchanged legacy history and rejects original empty contact IDs',()=>{
 const {result}=prepareRepair(live,hash(bytes))
 assert.equal(validateContacts(result.contacts),null)
 assert.ok(validateContacts(live.contacts))
 assert.ok(isDeepStrictEqual(result.contacts.flatMap(c=>c.history),live.contacts.flatMap(c=>c.history)))
 const duplicate=structuredClone(result.contacts);duplicate[1].id=duplicate[0].id;assert.ok(validateContacts(duplicate))
})
