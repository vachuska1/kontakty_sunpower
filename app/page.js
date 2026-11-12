'use client'

import { useEffect, useMemo, useState, useRef } from 'react'

import { migrate, scheduled, scheduleGroup, updateHistory, mergeImport } from '../lib/contacts.mjs'
import { DataTools, CallDialog } from './tools'
import { groups, statuses } from '../lib/options.mjs'

const STORAGE = 'sunpower-contacts-neon-20261018-v1'
const WRITE_PROTOCOL = 'contacts-20261018-v1'
const emptyForm = { name: '', profession: '', phone: '', address: '', city: '', postalCode: '', district: '', email: '', services: '', note: '' }
const phoneLink = phone => `tel:+420${String(phone || '').replace(/\D/g, '').slice(-9)}`

export default function Home() {
  const [contacts, setContacts] = useState([])
  const [ready, setReady] = useState(false)
  const [onlineSync, setOnlineSync] = useState(false)
  const [syncState, setSyncState] = useState('local')
  const [saveTick,setSaveTick] = useState(0)
  const [type, setType] = useState('elektrikari')
  const [view, setView] = useState('cards')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [index, updateIndex] = useState(0)
  const selectedId = useRef(null)
  function setIndex(value) { selectedId.current = null; updateIndex(value) }
  const [editing, setEditing] = useState(null)
  const [callEditing, setCallEditing] = useState(null)
  const [dataBusy, setDataBusy] = useState(false)
  const [repairBlocked, setRepairBlocked] = useState(false)
  const blocked = useRef(false), conflict = useRef(false)
  const [loadError, setLoadError] = useState('')
  const [plan, setPlan] = useState('')
  const dirty = useRef(false), version = useRef(null), saving = useRef(false), changeNumber = useRef(0)
  const busy = useRef(false)
  busy.current = !!editing || !!callEditing || dataBusy
  function changeContacts(value) { if (blocked.current) return; dirty.current = true; changeNumber.current++; setContacts(value) }
  function accept(raw, remote = false) {
    if (remote) {
      const ids = raw.map(c=>c.id)
      blocked.current = ids.some(id=>typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length
      setRepairBlocked(blocked.current)
      // Server data must be displayed and stored verbatim; ID repair is a separate approved operation.
      setContacts(raw)
      return
    }
    const converted = migrate(raw)
    if (JSON.stringify(converted) !== JSON.stringify(raw)) {
      // A complete persistent snapshot is required before any migration is applied.
      localStorage.setItem(`${STORAGE}-before-migration-${Date.now()}`, JSON.stringify(raw))
      dirty.current = true; changeNumber.current++
    }
    setContacts(converted)
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/contacts', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          const saved = localStorage.getItem(STORAGE)
          version.current = data.updatedAt
          const meta = JSON.parse(localStorage.getItem(`${STORAGE}-meta`) || '{}')
          accept(data.contacts, true)
          if (saved && (meta.pending || (!meta.version && JSON.stringify(JSON.parse(saved)) !== JSON.stringify(data.contacts)))) {
            localStorage.setItem(`${STORAGE}-pending-before-server-${Date.now()}`, saved)
            version.current = meta.version || 'unknown'; dirty.current = true
            conflict.current = !meta.version || meta.version !== data.updatedAt
            const pending = JSON.parse(saved)
            if (pending.some(c=>!c.id) || new Set(pending.map(c=>c.id)).size !== pending.length) { blocked.current = true; setRepairBlocked(true) }
            setContacts(pending)
          }
          setOnlineSync(true); setSyncState(conflict.current ? 'error' : 'saved'); setReady(true); return
        }
      } catch {}
      throw new Error('Společná databáze není dostupná. Obnovte stránku; starší místní data se neodesílají.')
    }
    load().catch(e=>setLoadError(`Načítání selhalo: ${e.message}. Místní data nebyla odstraněna.`))
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(STORAGE, JSON.stringify(contacts)); localStorage.setItem(`${STORAGE}-meta`, JSON.stringify({pending:dirty.current,version:version.current})) } catch { setSyncState('error'); return }
    if (!onlineSync || !dirty.current || busy.current) return
    const timer = setTimeout(() => saveNow(), 700)
    return () => clearTimeout(timer)
  }, [contacts, ready, onlineSync, editing, callEditing, dataBusy, saveTick])
  useEffect(() => {
    if (!onlineSync) return
    const timer = setInterval(async () => {
      if (busy.current || dirty.current || saving.current) return
      const generation = changeNumber.current
      try {
        const response = await fetch('/api/contacts', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          if (!busy.current && !dirty.current && !saving.current && generation === changeNumber.current) {
            version.current = data.updatedAt
            accept(data.contacts, true)
          }
        }
      } catch {}
    }, 15000)
    return () => clearInterval(timer)
  }, [onlineSync])

  const list = useMemo(() => contacts.filter(c => {
    const hay = `${(c.history || []).map(h=>h.note || '').join(' ')} ${c.name} ${c.profession} ${c.address} ${c.city} ${c.postalCode} ${c.district} ${c.phone} ${c.email} ${c.services} ${c.note}`.toLocaleLowerCase('cs')
    return (!plan || scheduleGroup(scheduled(c)) === plan) && c.type === type && (!filter || c.status === filter) && hay.includes(query.toLocaleLowerCase('cs'))
  }), [contacts, type, filter, query, plan])
  const selectedIndex = selectedId.current ? list.findIndex(c=>c.id===selectedId.current) : -1
  const visibleIndex = selectedIndex >= 0 ? selectedIndex : Math.min(index, Math.max(0,list.length-1))
  const current = list[visibleIndex]
  selectedId.current = current?.id || null

  function patch(id, values) {
    changeContacts(items => items.map(c => c.id === id ? { ...c, ...values } : c))
  }
  async function saveNow() {
    if (!onlineSync) {
      alert('Společná databáze zatím není připojena. Změny jsou uložené pouze v tomto zařízení.')
      return
    }
    if (blocked.current || conflict.current || saving.current || busy.current || !dirty.current) return
    saving.current = true
    const generation = changeNumber.current
    setSyncState('saving')
    try {
      const response = await fetch('/api/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Sunpower-Write-Protocol': WRITE_PROTOCOL }, body: JSON.stringify({ contacts, expectedUpdatedAt: version.current }) })
      const data = await response.json()
      if (response.ok) {
        version.current = data.updatedAt
        if (generation === changeNumber.current) dirty.current = false
        localStorage.setItem(`${STORAGE}-meta`, JSON.stringify({pending:dirty.current,version:version.current}))
        setSyncState(dirty.current ? 'pending' : 'saved')
        if(dirty.current) setSaveTick(n=>n+1)
      } else {
        setSyncState('error')
        if (response.status === 409) { conflict.current = true; alert(data.error) }
      }
    } catch { setSyncState('error') }
    finally { saving.current = false }
  }
  async function resolveConflict() {
    if (blocked.current || busy.current || saving.current || !confirm('Sloučit místní data se serverem? Historie obou kopií zůstane zachovaná. Neprázdné místní údaje budou mít přednost. Obě kopie se předem zálohují v tomto prohlížeči.')) return
    saving.current = true
    try {
      const response = await fetch('/api/contacts', {cache:'no-store'})
      if (!response.ok) throw new Error('Server není dostupný')
      const data = await response.json()
      localStorage.setItem(`${STORAGE}-conflict-local-${Date.now()}`,JSON.stringify(contacts))
      localStorage.setItem(`${STORAGE}-conflict-server-${Date.now()}`,JSON.stringify(data.contacts))
      if (data.contacts.some(c=>!c.id) || new Set(data.contacts.map(c=>c.id)).size !== data.contacts.length) throw new Error('Nejprve je nutná schválená oprava ID na serveru.')
      const merged = mergeImport(data.contacts,contacts,true)
      version.current = data.updatedAt
      conflict.current = false
      changeContacts(merged)
      setSyncState('pending')
    } catch(e) { alert(`Sloučení se neprovedlo: ${e.message}`) }
    finally { saving.current = false }
  }
  function chooseStatus(contact, status) { if (blocked.current) return; setCallEditing({ contact, record: { status } }) }
  function startCall(contact) { if (blocked.current) return; setCallEditing({ contact, record: { status: 'started', note: '' } }) }
  function saveCall(record) {
    const c = contacts.find(c => c.id === callEditing.contact.id)
    const now = new Date().toISOString()
    const entry = { ...record, legacy: false, id: record.id || crypto.randomUUID(), createdAt: record.createdAt || now, updatedAt: now }
    const history = callEditing.historyIndex !== undefined ? (c.history || []).map((h,i) => i === callEditing.historyIndex ? entry : h) : [...(c.history || []), entry]
    patch(c.id, updateHistory(c, history))
    setCallEditing(null)
  }

  function saveContact(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    delete values.id
    if (editing?.id) patch(editing.id, values)
    else changeContacts(items => [...items, { id: crypto.randomUUID(), type: values.type || type, status: 'new', calledAt: '', followUp: '', history: [], ...values }])
    setEditing(null)
  }
  function exportCsv() {
    const cols = ['type','name','profession','phone','email','address','city','postalCode','district','services','status','calledAt','followUp','note']
    const q = value => `"${String(value ?? '').replaceAll('"','""')}"`
    const csv = '\ufeff' + [cols.join(';'), ...contacts.map(c => cols.map(k => q(c[k])).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'sunpower-kontakty.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (!ready) return <main className="loading">{loadError || 'Načítám kontakty…'}</main>
  return <div className="app-shell">
    <header>
      <div><small>SUNPOWER</small><h1>Kontakty <span className={`sync ${syncState}`}>{onlineSync ? (syncState === 'saving' ? 'ukládám…' : syncState === 'error' ? 'chyba ukládání — stáhněte JSON zálohu' : syncState === 'pending' ? 'neuložené změny' : 'online') : 'toto zařízení'}</span></h1></div>
      <div className="header-actions">
        <button disabled={repairBlocked} className="save-button" onClick={saveNow}>Uložit</button>
        <button className="square" onClick={() => setView(view === 'cards' ? 'table' : 'cards')} aria-label="Změnit zobrazení">{view === 'cards' ? '▦' : '▤'}</button>
        <button disabled={repairBlocked} className="primary" onClick={() => setEditing(emptyForm)}>Přidat</button>
      </div>
    </header>

    {repairBlocked && <p role="alert">Uložená data vyžadují schválenou opravu ID. Prohlížení a JSON záloha jsou dostupné; úpravy a synchronizace zápisů jsou pozastaveny.</p>}
    <nav>
      {Object.entries(groups).map(([key, [label]]) => <button key={key} className={type === key ? 'active' : ''} onClick={() => {setType(key);setIndex(0)}}>{label} <b>{contacts.filter(c=>c.type===key).length}</b></button>)}
    </nav>

    <section className="plans">{[['','Vše'],['today','Volat dnes'],['overdue','Po termínu'],['future','Budoucí hovory']].map(([key,label])=><button className={plan===key?'primary':''} key={key} onClick={()=>{setPlan(key);setIndex(0)}}>{label} {key && contacts.filter(c=>c.type===type && scheduleGroup(scheduled(c))===key).length}</button>)}</section>
    <section className="tools">
      <input type="search" placeholder="Hledat jméno, město, telefon…" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} />
      <select value={filter} onChange={e=>{setFilter(e.target.value);setIndex(0)}}><option value="">Všechny stavy</option>{Object.entries(statuses).map(([k,v])=><option value={k} key={k}>{v[0]}</option>)}</select>
    </section>

    <section className="stats">{Object.entries(statuses).map(([key, value]) => <span key={key}>{value[0]}: {list.filter(c=>c.status===key).length}</span>)}</section>

    {view === 'cards' ? <main className="cards-area">
      {current ? <ContactCard key={current.id} readOnly={repairBlocked} contact={current} patch={patch} chooseStatus={chooseStatus} startCall={startCall} edit={setEditing} editCall={(record,historyIndex)=>setCallEditing({contact:current,record,historyIndex})} removeCall={historyIndex=>{if(confirm('Smazat tento záznam hovoru?'))patch(current.id,updateHistory(current,(current.history || []).filter((h,i)=>i!==historyIndex)))}} remove={id=>{if(confirm('Opravdu smazat tento kontakt?'))changeContacts(c=>c.filter(x=>x.id!==id))}} /> : <p className="empty">{contacts.some(c=>c.type===type) ? 'Žádný kontakt neodpovídá filtru.' : 'V této sekci zatím nejsou žádné kontakty.'}</p>}
    </main> : <ContactTable contacts={list} startCall={startCall} />}

    {view === 'cards' && <footer>
      <div className="footer-main"><button onClick={()=>setIndex(Math.max(0,visibleIndex-1))}>← Předchozí</button><strong>{list.length ? Math.min(visibleIndex+1,list.length) : 0} / {list.length}</strong><button onClick={()=>setIndex(Math.min(list.length-1,visibleIndex+1))}>Další →</button></div>
      <div className="footer-jump"><button onClick={()=>setIndex(0)}>⇤ Na začátek {groups[type][1]}</button><button onClick={()=>setIndex(Math.max(0,list.length-1))}>Na konec {groups[type][1]} ⇥</button></div>
    </footer>}

    {onlineSync && syncState==='error' && <button onClick={resolveConflict}>Sloučit místní změny se serverem…</button>}
    <DataTools readOnly={repairBlocked} onBusy={setDataBusy} contacts={contacts} merge={incoming=>{changeContacts(incoming)}} />
    {callEditing && <CallDialog isEditing={callEditing.historyIndex !== undefined} record={callEditing.record} close={()=>setCallEditing(null)} save={saveCall} />}
    <button className="export" onClick={exportCsv}>⇩ <span>Export CSV</span></button>
    {editing && <ContactDialog contact={editing} defaultType={type} close={()=>setEditing(null)} save={saveContact} />}
  </div>
}

function ContactCard({ readOnly, contact:c, chooseStatus, startCall, edit, remove, editCall, removeCall }) {
  const meta = statuses[c.status] || statuses.new
  return <article className={`contact-card ${meta[1]}`}><fieldset disabled={readOnly} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <div className="card-head"><div><h2>{c.name}</h2><p>{c.city || 'Město neuvedeno'}{c.profession ? ` · ${c.profession}` : ''}</p></div><span className="badge">{meta[0]}</span></div>
    <a className="call" href={phoneLink(c.phone)} onClick={()=>startCall(c)}>{c.phone}</a>
    <div className="info"><label>Co přesně dělá<strong>{c.services || c.profession || 'neuvedeno'}</strong></label><label>Lokalita<strong>{[c.address, [c.postalCode,c.city].filter(Boolean).join(' '), c.district && `okres ${c.district}`].filter(Boolean).join(', ') || 'neuvedena'}</strong></label><label>E-mail<span>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : 'neuveden'}</span></label>{c.interest && <label>Zájem o<strong>{c.interest}</strong></label>}</div>
    {c.sourceInfo && <details className="source-info"><summary>Původní informace z PDF</summary><p>{c.sourceInfo}</p></details>}
    <div className="status-buttons">{Object.entries(statuses).map(([key,value])=><button className={`${value[1]} ${c.status===key?'selected':''}`} onClick={()=>chooseStatus(c,key)} key={key}>{value[0]}</button>)}</div>
    {scheduled(c) && <p className={scheduleGroup(scheduled(c))==='overdue'?'overdue':''}><b>Další hovor: {new Date(scheduled(c)).toLocaleString('cs-CZ')}</b></p>}
    {c.note && <details><summary>Původní poznámka</summary><p>{c.note}</p></details>}
    <button className="primary" onClick={()=>editCall({status:c.status})}>Záznam hovoru</button>
    <div className="card-actions"><button onClick={()=>edit(c)}>Upravit kontakt</button><button onClick={()=>remove(c.id)}>Smazat</button></div>
    {!!c.history?.length && <section><h3>Historie komunikace ({c.history.length})</h3>{c.history.map((h,index)=>({h,index})).sort((a,b)=>String(b.h.at).localeCompare(String(a.h.at))).map(({h,index})=><div className="history" key={h.id || `legacy-${index}`}><time>{h.at ? new Date(h.at).toLocaleString('cs-CZ') : 'Datum neuvedeno'}</time><b>{statuses[h.status]?.[0] || (h.status==='started'?'Zahájeno volání':h.status)}</b><p>{h.note}</p>{h.followUp && <p>Další kontakt: {new Date(h.followUp).toLocaleString('cs-CZ')}</p>}<button onClick={()=>editCall(h,index)}>Opravit</button> <button onClick={()=>removeCall(index)}>Smazat</button></div>)}</section>}

  </fieldset></article>
}

function ContactTable({ contacts, startCall }) {
  return <main className="table-wrap"><table><thead><tr><th>Stav</th><th>Firma / jméno</th><th>Profese</th><th>Co přesně dělá</th><th>Telefon</th><th>Adresa</th><th>Město</th><th>PSČ</th><th>Okres</th><th>Voláno</th><th>Další kontakt</th><th>Poznámka</th></tr></thead><tbody>{contacts.map(c=><tr className={statuses[c.status]?.[1]} key={c.id}><td>{statuses[c.status]?.[0]}</td><td><b>{c.name}</b></td><td>{c.profession}</td><td>{c.services}</td><td><a onClick={()=>startCall(c)} href={phoneLink(c.phone)}>{c.phone}</a></td><td>{c.address}</td><td>{c.city}</td><td>{c.postalCode}</td><td>{c.district}</td><td>{c.calledAt ? new Date(c.calledAt).toLocaleString('cs-CZ') : ''}</td><td className={scheduleGroup(scheduled(c))==='overdue'?'overdue':''}>{scheduled(c) ? new Date(scheduled(c)).toLocaleString('cs-CZ') : ''}</td><td>{c.note}</td></tr>)}</tbody></table></main>
}

function ContactDialog({ contact, defaultType, close, save }) {
  return <div className="modal" role="dialog" aria-modal="true" aria-label="Kontakt" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><form onSubmit={save}>
    <div className="modal-head"><h2>{contact.id ? 'Upravit kontakt' : 'Nový kontakt'}</h2><button type="button" onClick={close}>×</button></div>
    <input type="hidden" name="id" defaultValue={contact.id || ''}/>
    <label>Skupina<select name="type" defaultValue={contact.type || defaultType}>{Object.entries(groups).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Firma nebo jméno<input name="name" required defaultValue={contact.name}/></label>
    <div className="two"><label>Profese<input name="profession" placeholder="Profese nebo obor" defaultValue={contact.profession}/></label><label>Telefon<input name="phone" inputMode="tel" required defaultValue={contact.phone}/></label></div>
    <label>Co přesně dělá<input name="services" placeholder="Např. elektroinstalace, výkopové práce…" defaultValue={contact.services}/></label>
    <label>Ulice / část obce / číslo<input name="address" defaultValue={contact.address}/></label>
    <div className="two"><label>Město / obec<input name="city" defaultValue={contact.city}/></label><label>PSČ<input name="postalCode" inputMode="numeric" defaultValue={contact.postalCode}/></label></div>
    <label>Okres<input name="district" defaultValue={contact.district}/></label>
    <label>E-mail<input name="email" inputMode="email" defaultValue={contact.email}/></label>
    <label>Obecná poznámka ke kontaktu (poznámky k hovorům zadávejte v záznamu hovoru)<textarea name="note" rows="4" defaultValue={contact.note}/></label>
    <div className="modal-actions"><button type="button" onClick={close}>Zrušit</button><button className="primary">Uložit kontakt</button></div>
  </form></div>
}
