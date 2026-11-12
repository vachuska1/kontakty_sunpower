import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { migrate, updateHistory, scheduled, scheduleGroup, mergeImport } from '../lib/contacts.mjs'
test('migration preserves all contacts, fields and original history and is idempotent',()=>{
 const original=JSON.parse(readFileSync('public/contacts.json'))
 const converted=migrate(original)
 assert.equal(converted.length,original.length)
 original.forEach((c,i)=>{for(const k of Object.keys(c).filter(k=>k!=='history'))assert.deepEqual(converted[i][k],c[k]);c.history.forEach((h,j)=>{for(const k of Object.keys(h))assert.deepEqual(converted[i].history[j][k],h[k])})})
 assert.deepEqual(migrate(converted),converted)
 assert.equal(new Set(converted.flatMap(c=>c.history.map(h=>h.id))).size,converted.flatMap(c=>c.history).length)
})
test('separate calls, editing, serialized refresh and reminders',()=>{
 const first={id:'one',at:'2026-10-16T15:00:00.000Z',status:'callback',note:'První poznámka',followUp:'2026-10-19T08:00:00.000Z'}
 const second={id:'two',at:'2026-10-19T10:00:00.000Z',status:'interested',note:'Druhá poznámka',followUp:''}
 let c=updateHistory({id:'contact',history:[]},[first]);assert.equal(scheduled(c),first.followUp)
 c=updateHistory(c,[first,second]);assert.equal(scheduled(c),'')
 c=updateHistory(c,c.history.map(h=>h.id==='two'?{...h,note:'Opravená druhá'}:h))
 c=JSON.parse(JSON.stringify(c));assert.deepEqual(c.history[0],first);assert.equal(c.history.length,2);assert.equal(c.history[1].note,'Opravená druhá')
 assert.equal(scheduleGroup('2026-10-16T19:00',new Date(2026,9,16,20)),'today')
 assert.equal(scheduleGroup('2026-10-15',new Date(2026,9,16)),'overdue')
 assert.equal(scheduleGroup('2026-10-19',new Date(2026,9,16)),'future')
})
test('repair empty IDs without reducing contact count',()=>{
 const c=migrate([{id:'',history:[]},{id:'',history:[]}]);assert.equal(c.length,2);assert.ok(c.every(x=>x.id));assert.notEqual(c[0].id,c[1].id)
})
test('duplicate imports skip by default and explicit merge preserves old history',()=>{
 const c=migrate([{id:'x',name:'A',phone:'123456789',type:'elektrikari',note:'Původní',history:[]}]);
 const incoming=migrate([{name:'A',phone:'123456789',type:'elektrikari',note:'Nová',history:[]}]);
 assert.deepEqual(mergeImport(c,incoming),c)
 const merged=mergeImport(c,incoming,true);assert.equal(merged.length,1);assert.equal(merged[0].history.length,2);assert.equal(mergeImport(merged,incoming,true)[0].history.length,2)
})
test('deleted migrated note does not reappear and started call keeps previous reminder',()=>{
 const [c]=migrate([{id:'x',note:'old',calledAt:'2026-10-16',followUp:'2026-10-19',history:[]}]);assert.equal(migrate([{...c,history:[]}])[0].history.length,0)
 const original={...c,history:[{id:'a',at:'2026-10-16',status:'callback',followUp:'2026-10-19'},{id:'b',at:'2026-10-17',status:'started',followUp:''}]}
 assert.equal(scheduled(original),'2026-10-19')
})

test('latest added call wins when timestamps match to the minute', () => {
 const history=[{at:'2026-11-12T10:00:00.000Z',status:'very-interested',followUp:''},{at:'2026-11-12T10:00:00.000Z',status:'agreed',followUp:''}]
 assert.equal(updateHistory({status:'new'},history).status,'agreed')
})
