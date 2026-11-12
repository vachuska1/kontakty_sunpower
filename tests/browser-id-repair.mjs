// Isolated synthetic API only. Never opens or writes to the production origin.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { validateContacts } from '../lib/validation.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.env.TEST_URL||'http://127.0.0.1:3187'
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Test requires local server')
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE})
const contact=(id,name,phone)=>({id,type:'elektrikari',name,phone,email:'',status:'new',note:'',calledAt:'',followUp:'',history:[]})
try {
 const context=await browser.newContext({timezoneId:'Europe/Prague'})
 const page=await context.newPage()
 let server=[contact('old-a','Fixture A','777000001'),contact('old-b','Fixture B','777000002')],version='1',puts=0,reads=0
 server[0].history=[{at:'2026-10-10T10:00:00Z',status:'no-answer',note:'Legacy history without ID'}]
 const original=structuredClone(server),errors=[]
 page.on('pageerror',()=>errors.push('Browser error'))
 page.on('dialog',d=>d.accept())
 await page.route('**/api/contacts',r=>{
  if(r.request().method()==='GET'){reads++;return r.fulfill({json:{contacts:server,updatedAt:version}})}
  const body=r.request().postDataJSON()
  assert.equal(validateContacts(body.contacts),null)
  assert.equal(body.expectedUpdatedAt,version)
  server=body.contacts;version=String(Number(version)+1);puts++
  return r.fulfill({json:{ok:true,updatedAt:version}})
 })
 await page.goto(base);await page.getByRole('button',{name:'Přidat',exact:true}).waitFor()
 await page.waitForTimeout(900);assert.equal(puts,0);assert.ok(isDeepStrictEqual(server,original))
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sunpower-contacts-neon-20261018-v1')))
 assert.ok(isDeepStrictEqual(saved,original),'Remote load modified history')
 async function add(name,phone){await page.getByRole('button',{name:'Přidat',exact:true}).click();await page.locator('.modal [name=name]').fill(name);await page.locator('.modal [name=phone]').fill(phone);await page.getByRole('button',{name:'Uložit kontakt',exact:true}).click();await page.waitForTimeout(900)}
 await add('New A','777000003');await add('New B','777000004')
 assert.equal(server.length,4);assert.ok(server[2].id&&server[3].id&&server[2].id!==server[3].id)
 const untouched=structuredClone(server[3])
 const search=page.locator('input[type=search]');await search.fill('New A')
 await page.getByRole('button',{name:'Upravit kontakt',exact:true}).click();await page.locator('.modal [name=name]').fill('New A edited');await page.getByRole('button',{name:'Uložit kontakt',exact:true}).click();await page.waitForTimeout(900)
 assert.ok(isDeepStrictEqual(server[3],untouched))
 await page.getByRole('button',{name:'Má zájem',exact:true}).click();await page.locator('.modal [name=at]').fill('2026-10-16T17:00');await page.locator('.modal [name=note]').fill('Only A first call');await page.getByRole('button',{name:'Potvrdit záznam'}).click();await page.waitForTimeout(900)
 assert.equal(server[2].status,'interested');assert.ok(isDeepStrictEqual(server[3],untouched));assert.equal(server[2].history[0].note,'Only A first call')
 const first=structuredClone(server[2].history[0])
 await page.getByRole('button',{name:'Záznam hovoru',exact:true}).click();await page.locator('.modal [name=at]').fill('2026-10-19T17:00');await page.locator('.modal [name=note]').fill('Only A second call');await page.getByRole('button',{name:'Potvrdit záznam'}).click();await page.waitForTimeout(900)
 await page.locator('.history').filter({hasText:'Only A second call'}).getByRole('button',{name:'Opravit'}).click();await page.locator('.modal [name=note]').fill('Only A second edited');await page.getByRole('button',{name:'Potvrdit záznam'}).click();await page.waitForTimeout(900)
 assert.ok(isDeepStrictEqual(server[2].history[0],first));assert.equal(server[2].history.length,2);assert.ok(isDeepStrictEqual(server[3],untouched))
 await page.getByRole('button',{name:'Záznam hovoru',exact:true}).click();await page.locator('.modal [name=note]').fill('Draft must survive polling');const beforeReads=reads;await page.waitForTimeout(16000);assert.equal(await page.locator('.modal [name=note]').inputValue(),'Draft must survive polling');assert.equal(reads,beforeReads);await page.getByRole('button',{name:'Zrušit',exact:true}).click()
 const csv='type;name;phone;id;note\nelektrikari;Attempt overwrite;777000004;;must skip\nelektrikari;CSV new;777000005;;CSV note'
 await page.locator('input[type=file]').setInputFiles({name:'check.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
 assert.equal(await page.locator('input[type=checkbox]').isChecked(),false)
 await page.getByRole('button',{name:'Potvrdit import a zálohovat současná data'}).click();await page.waitForTimeout(900)
 assert.ok(isDeepStrictEqual(server[3],untouched));assert.equal(server.length,5)
 const XLSX=await import('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{type:'elektrikari',name:'XLSX new',phone:'777000006',id:'',note:'Sheet note'},{type:'elektrikari',name:'XLSX overwrite attempt',phone:'777000004',id:'',note:'must skip'}]),'Contacts')
 await page.locator('input[type=file]').setInputFiles({name:'check.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))})
 await page.getByRole('button',{name:'Potvrdit import a zálohovat současná data'}).click();await page.waitForTimeout(900)
 assert.equal(server.length,6);assert.ok(server.every(c=>c.id));assert.equal(new Set(server.map(c=>c.id)).size,6);assert.ok(isDeepStrictEqual(server[3],untouched));assert.ok(isDeepStrictEqual(server.slice(0,2),original))
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Úplná JSON záloha'}).click();const artifact=await downloaded,backup=JSON.parse(readFileSync(await artifact.path()));assert.ok(isDeepStrictEqual(backup.contacts,server));assert.ok(backup.contacts.every(c=>Object.hasOwn(c,'id')&&Object.hasOwn(c,'history')))
 const deletedId=server[2].id
 await page.getByRole('button',{name:'Smazat',exact:true}).first().click();await page.waitForTimeout(900)
 assert.equal(server.length,5);assert.ok(!server.some(c=>c.id===deletedId));assert.ok(server.some(c=>isDeepStrictEqual(c,untouched)));assert.ok(isDeepStrictEqual(server.slice(0,2),original))
 // Existing legacy history remains unchanged until the user explicitly edits that record.
 await search.fill('Fixture A');await page.locator('.history').getByRole('button',{name:'Opravit'}).click();await page.locator('.modal [name=note]').fill('Explicit legacy edit');await page.getByRole('button',{name:'Potvrdit záznam'}).click();await page.waitForTimeout(900);assert.equal(server[0].history.length,1);assert.ok(server[0].history[0].id);assert.ok(isDeepStrictEqual(server[1],original[1]))
 assert.deepEqual(errors,[]);await context.close()
 // A snapshot requiring approved ID repair must never trigger an automatic migration or PUT.
 const blockedContext=await browser.newContext(),blockedPage=await blockedContext.newPage()
 const broken=[contact('','Broken A','777000007'),contact('','Broken B','777000008')];let forbiddenWrites=0
 await blockedPage.route('**/api/contacts',r=>{if(r.request().method()!=='GET'){forbiddenWrites++;return r.abort()}return r.fulfill({json:{contacts:broken,updatedAt:'broken'}})})
 await blockedPage.goto(base);await blockedPage.locator('p[role=alert]').waitFor();await blockedPage.waitForTimeout(900);assert.equal(await blockedPage.getByRole('button',{name:'Přidat',exact:true}).isDisabled(),true);assert.equal(forbiddenWrites,0);assert.ok(isDeepStrictEqual(await blockedPage.evaluate(()=>JSON.parse(localStorage.getItem('sunpower-contacts-neon-20261018-v1'))),broken));await blockedContext.close()
 // An older pending local snapshot may never be automatically uploaded against a newer server.
 const staleContext=await browser.newContext(),stale=await staleContext.newPage();let staleWrites=0
 await stale.addInitScript(()=>{localStorage.setItem('sunpower-contacts-neon-20261018-v1',JSON.stringify([{id:'local-old',name:'Stale local',type:'elektrikari',phone:'777000009',history:[]} ]));localStorage.setItem('sunpower-contacts-neon-20261018-v1-meta',JSON.stringify({pending:true,version:'old-version'}))})
 await stale.route('**/api/contacts',r=>{if(r.request().method()!=='GET'){staleWrites++;return r.abort()}return r.fulfill({json:{contacts:original,updatedAt:'new-version'}})})
 await stale.goto(base);await stale.getByRole('button',{name:'Sloučit místní změny se serverem…'}).waitFor();await stale.waitForTimeout(900);assert.equal(staleWrites,0);await staleContext.close()
 console.log('PASS: all 10 ID/application checks, unchanged remote load, legacy history editing, repair gate, stale-local upload gate. Synthetic data only.')
} finally {await browser.close()}
