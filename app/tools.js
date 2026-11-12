'use client'
import { useState, useEffect } from 'react'
import { groups, statuses } from '../lib/options.mjs'
import { migrate, mergeImport } from '../lib/contacts.mjs'

function download(contacts) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'sunpower-full-v1', exportedAt: new Date().toISOString(), contacts }, null, 2)], {type:'application/json'}))
  const a = document.createElement('a'); a.href=url; a.download=`sunpower-full-${Date.now()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000)
}
const names = { 'Firma / jméno':'name', 'Profese':'profession', 'Telefon':'phone', 'E-mail':'email', 'Adresa':'address', 'Město / obec':'city', 'PSČ':'postalCode', 'Okres':'district', 'Služby':'services', 'Poznámka':'note', 'Výsledek hovoru':'status', 'Datum hovoru':'calledAt', 'Voláno':'calledAt', 'Termín dalšího kontaktu':'followUp', 'Další kontakt':'followUp', 'Skupina':'type' }
const statusNames = {...Object.fromEntries(Object.entries(statuses).map(([key, [label]]) => [label, key])), Kontaktován: 'callback'}
function dateValue(value, XLSX) {
  if (!value) return ''
  if (typeof value === 'number') { const d=XLSX.SSF.parse_date_code(value); return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}T${String(d.H).padStart(2,'0')}:${String(d.M).padStart(2,'0')}` }
  const text=String(value).trim()
  const m=text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${m[5]||'00'}`
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) || Number.isNaN(new Date(text).getTime())) throw new Error(`Neplatné datum: ${text}`)
  return text
}
export function DataTools({ contacts, merge, onBusy, readOnly }) {
  const [preview,setPreview]=useState(null), [mode,setMode]=useState(false), [error,setError]=useState('')
  useEffect(()=>{onBusy(!!preview);return ()=>onBusy(false)},[preview,onBusy])
  async function read(event) {
    const file=event.target.files[0]; event.target.value=''; if(!file)return
    try {
      setError('');setMode(false)
      let incoming
      if(file.name.toLowerCase().endsWith('.json')) {
        const raw=JSON.parse(await file.text()); incoming=Array.isArray(raw)?raw:raw.contacts
      } else {
        const XLSX=await import('xlsx')
        const workbook=file.name.toLowerCase().endsWith('.csv') ? XLSX.read(await file.text(),{type:'string',raw:true}) : XLSX.read(await file.arrayBuffer(),{type:'array'})
        const rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:''})
        incoming=rows.map(row=>{
          const c=Object.fromEntries(Object.entries(row).map(([k,v])=>[names[k.trim()]||k.trim(),String(v)]))
          for(const key of ['calledAt','followUp']) { const original=Object.entries(row).find(([k])=>(names[k.trim()]||k.trim())===key);c[key]=dateValue(original?.[1],XLSX) }
          c.type=c.type||'elektrikari';c.status=statusNames[c.status]||c.status||'new';c.history=[]
          if(c.note || c.calledAt || c.followUp || (c.status && c.status!=='new')) c.history.push({id:crypto.randomUUID(),at:c.calledAt||'',status:c.status,note:c.note||'',followUp:c.followUp||'',createdAt:new Date().toISOString()})
          return c
        })
      }
      if(!Array.isArray(incoming)||incoming.length>5000||incoming.some(c=>!c||typeof c!=='object'||!c.name||!c.phone||!Object.hasOwn(groups,c.type)|| (c.history!==undefined&&!Array.isArray(c.history))))throw new Error('Neplatné kontakty: vyžadováno jméno, telefon a skupina elektrikari, instalateri, pivovary nebo mlekarny.')
      // Preserve the complete raw input before normalization.
      localStorage.setItem(`sunpower-import-source-${Date.now()}`,JSON.stringify(incoming))
      setPreview(migrate(incoming))
    } catch(e){setError(`Import se neprovedl: ${e.message}`)}
  }
  const proposed=preview?mergeImport(contacts,preview,mode):contacts
  const added=proposed.reduce((n,c)=>n+(c.history?.length||0),0)-contacts.reduce((n,c)=>n+(c.history?.length||0),0)
  return <section className="data-tools"><button onClick={()=>download(contacts)}>Úplná JSON záloha</button><label>Import JSON / XLSX / CSV <input disabled={readOnly} type="file" accept=".json,.xlsx,.csv" onChange={read}/></label>{error&&<p role="alert">{error}</p>}{preview&&<div><p>Načteno {preview.length} kontaktů. Nové kontakty: {proposed.length-contacts.length}. Přidá se {added} záznamů historie. Duplicity se standardně přeskočí.</p><label><input type="checkbox" checked={mode} onChange={e=>setMode(e.target.checked)}/> Výslovně povoluji sloučení duplicit a historie (neprázdné importované údaje nahradí odpovídající údaje kontaktu).</label><button onClick={()=>{
    try {localStorage.setItem(`sunpower-before-import-${Date.now()}`,JSON.stringify(contacts));download(contacts);merge(proposed);setPreview(null)}catch(e){setError('Záloha se nepodařila, import zastaven: '+e.message)}
  }}>Potvrdit import a zálohovat současná data</button><button onClick={()=>setPreview(null)}>Zrušit</button></div>}</section>
}
function localTime(value) {
 if(!value)return ''
 const d=new Date(value); if(Number.isNaN(d.getTime()))return ''
 const z=n=>String(n).padStart(2,'0')
 return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}
export function CallDialog({ record, close, save, isEditing }) {
 const [status,setStatus]=useState(record.status||'new')
 return <div className="modal" role="dialog" aria-modal="true" aria-label="Záznam hovoru"><form onSubmit={e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));save({...record,...values,at:new Date(values.at).toISOString(),followUp:values.followUp?new Date(values.followUp).toISOString():''})}}><h2>{record.id || isEditing?'Opravit hovor':'Nový záznam hovoru'}</h2><label>Datum a čas hovoru<input name="at" type="datetime-local" required defaultValue={localTime(record.at||new Date().toISOString())}/></label><label>Výsledek<select name="status" value={status} onChange={e=>setStatus(e.target.value)}>{[['started','Zahájeno volání — výsledek nepotvrzen'], ...Object.entries(statuses).map(([key, [label]]) => [key, label])].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Poznámka k tomuto hovoru<textarea name="note" rows="5" required={status==='callback'} defaultValue={record.note||''}/></label><label>Další kontakt — datum a čas<input name="followUp" type="datetime-local" required={status==='callback'} defaultValue={localTime(record.followUp)}/></label>{status==='callback'&&<p>Do poznámky uveďte, proč a kvůli čemu se má znovu volat.</p>}<div className="modal-actions"><button type="button" onClick={close}>Zrušit</button><button className="primary">Potvrdit záznam</button></div></form></div>
}
