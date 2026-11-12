#!/usr/bin/env node
// Offline preparation only: no network imports, no database client and no apply mode.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const sha256 = value => createHash('sha256').update(value).digest('hex')
export function counts(contacts) {
  const ids = contacts.map(c=>c.id).filter(Boolean)
  return {
    contacts: contacts.length, emptyIds: contacts.filter(c=>!c.id).length,
    duplicateIds: ids.length-new Set(ids).size,
    phones: contacts.filter(c=>c.phone).length, emails: contacts.filter(c=>c.email).length,
    notes: contacts.filter(c=>c.note).length,
    contactsWithHistory: contacts.filter(c=>c.history?.length).length,
    historyRecords: contacts.reduce((n,c)=>n+(c.history?.length||0),0),
  }
}
export function prepareRepair(response, snapshotHash) {
  if (!response || !Array.isArray(response.contacts)) throw new Error('Missing contacts array')
  const contacts=response.contacts, used=new Set(contacts.map(c=>c.id).filter(Boolean))
  if (counts(contacts).duplicateIds) throw new Error('Existing nonempty IDs are duplicated; refusing to change them')
  const changes=[]
  const repaired=contacts.map((c,index)=>{
    if (c.id) return structuredClone(c)
    if (c.id !== '') throw new Error('Expected an explicitly empty string ID; refusing unexpected missing/null ID')
    let counter=0,id
    do { id=`repair-${sha256(`${snapshotHash}:${index}:${counter++}`).slice(0,32)}` } while(used.has(id))
    used.add(id);changes.push({index,field:'id',before:'',after:id})
    return {...structuredClone(c),id}
  })
  const result={...structuredClone(response),contacts:repaired}
  const report=verifyRepair(response,result)
  return {result,report:{...report,changes}}
}
export function verifyRepair(before,after) {
  const {contacts:a,...metadataA}=before,{contacts:b,...metadataB}=after
  if (!isDeepStrictEqual(metadataA,metadataB)) throw new Error('Response metadata changed')
  if(a.length!==b.length)throw new Error('Contact count changed')
  const differences=[]
  for(let i=0;i<a.length;i++) {
    const fields=new Set([...Object.keys(a[i]),...Object.keys(b[i])])
    for(const field of fields) if(!isDeepStrictEqual(a[i][field],b[i][field]) || Object.hasOwn(a[i],field)!==Object.hasOwn(b[i],field)) {
      if(field!=='id'||a[i].id!==''||!b[i].id)throw new Error(`Forbidden field change at contact index ${i}, field ${field}`)
      differences.push({index:i,field})
    }
    if(a[i].id==='' && a[i].id===b[i].id)throw new Error('Empty ID was not repaired')
  }
  const pre=counts(a),post=counts(b)
  if(post.emptyIds||post.duplicateIds)throw new Error('Invalid resulting IDs')
  for(const field of ['contacts','phones','emails','notes','contactsWithHistory','historyRecords'])if(pre[field]!==post[field])throw new Error(`Count changed: ${field}`)
  return {before:pre,after:post,changedFields:differences.length,onlyEmptyContactIdsChanged:true,metadataUnchanged:true,contactOrderUnchanged:true,allFieldsCompared:true}
}
function writeOnce(file,bytes) {
  try {writeFileSync(file,bytes,{flag:'wx'})}
  catch(e){if(e.code!=='EEXIST'||!readFileSync(file).equals(Buffer.from(bytes)))throw e}
}
export function main(args) {
  const {values}=parseArgs({args,options:{'dry-run':{type:'boolean'},label:{type:'string',default:'2026-10-16'}},strict:true,allowPositionals:false})
  const label=values.label
  if(!/^[A-Za-z0-9_-]+$/.test(label))throw new Error('Invalid backup label')
  const input=`backups/live-contacts-before-id-repair-${label}.json`
  const manifest=JSON.parse(readFileSync(`backups/live-contacts-backup-manifest-${label}.json`))
  for(const f of manifest.files)if(sha256(readFileSync(f.path))!==f.sha256)throw new Error(`Backup checksum mismatch: ${f.path}`)
  const bytes=readFileSync(input),before=JSON.parse(bytes),sourceHash=sha256(bytes)
  if(!isDeepStrictEqual(before.contacts,JSON.parse(readFileSync(manifest.files[1].path))))throw new Error('Contacts array backup differs')
  const prepared=prepareRepair(before,sourceHash)
  const {report,result}=prepared
  if(report.before.contacts!==178||report.before.emptyIds!==14||report.before.historyRecords!==209||report.changedFields!==14)throw new Error('Unexpected live baseline; stop for review')
  const resultBytes=JSON.stringify(result,null,2)+'\n'
  const output=`backups/live-contacts-id-repair-prepared-${label}.json`
  writeOnce(output,resultBytes)
  verifyRepair(before,JSON.parse(readFileSync(output)))
  const summary={mode:'dry-run',source:input,sourceSHA256:sourceHash,prepared:output,preparedSHA256:sha256(resultBytes),...report,productionWrites:0,historyReviewRequired:14}
  writeOnce(`backups/live-contacts-id-repair-report-${label}.json`,JSON.stringify(summary,null,2)+'\n')
  console.log(JSON.stringify(summary,null,2))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2))
