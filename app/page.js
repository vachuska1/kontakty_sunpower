'use client'

import { useEffect, useMemo, useState } from 'react'

const STORAGE = 'sunpower-contacts-v4'
const statuses = {
  new: ['Nevoláno', 'neutral'],
  interested: ['Má zájem', 'green'],
  'not-interested': ['Nemá zájem', 'red'],
  'no-answer': ['Nezvedá', 'orange'],
  invalid: ['Číslo neexistuje', 'brown'],
  callback: ['Zavolat později', 'blue'],
}
const emptyForm = { name: '', profession: '', phone: '', address: '', city: '', postalCode: '', district: '', email: '', services: '', note: '' }
const phoneLink = phone => `tel:+420${String(phone || '').replace(/\D/g, '').slice(-9)}`
const localDateTime = value => {
  if (!value) return ''
  const d = new Date(value), z = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

export default function Home() {
  const [contacts, setContacts] = useState([])
  const [ready, setReady] = useState(false)
  const [onlineSync, setOnlineSync] = useState(false)
  const [syncState, setSyncState] = useState('local')
  const [type, setType] = useState('elektrikari')
  const [view, setView] = useState('cards')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [index, setIndex] = useState(0)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/contacts', { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json()
          const saved = localStorage.getItem(STORAGE)
          setContacts(data.initialized && saved ? JSON.parse(saved) : data.contacts)
          setOnlineSync(true); setSyncState('saved'); setReady(true); return
        }
      } catch {}
      const saved = localStorage.getItem(STORAGE)
      if (saved) setContacts(JSON.parse(saved))
      else setContacts(await fetch('/contacts.json').then(r => r.json()))
      setReady(true)
    }
    load()
  }, [])
  useEffect(() => {
    if (!ready) return
    localStorage.setItem(STORAGE, JSON.stringify(contacts))
    if (!onlineSync) return
    setSyncState('saving')
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts }) })
        setSyncState(response.ok ? 'saved' : 'error')
      } catch { setSyncState('error') }
    }, 700)
    return () => clearTimeout(timer)
  }, [contacts, ready, onlineSync])
  useEffect(() => {
    if (!onlineSync) return
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/contacts', { cache: 'no-store' })
        if (response.ok) setContacts((await response.json()).contacts)
      } catch {}
    }, 15000)
    return () => clearInterval(timer)
  }, [onlineSync])

  const list = useMemo(() => contacts.filter(c => {
    const hay = `${c.name} ${c.profession} ${c.address} ${c.city} ${c.postalCode} ${c.district} ${c.phone} ${c.email} ${c.services} ${c.note}`.toLocaleLowerCase('cs')
    return c.type === type && (!filter || c.status === filter) && hay.includes(query.toLocaleLowerCase('cs'))
  }), [contacts, type, filter, query])
  const current = list[Math.min(index, Math.max(0, list.length - 1))]

  function patch(id, values) {
    setContacts(items => items.map(c => c.id === id ? { ...c, ...values } : c))
  }
  async function saveNow() {
    if (!onlineSync) {
      alert('Společná databáze zatím není připojena. Změny jsou uložené pouze v tomto zařízení.')
      return
    }
    setSyncState('saving')
    try {
      const response = await fetch('/api/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacts }) })
      setSyncState(response.ok ? 'saved' : 'error')
      if (!response.ok) alert('Změny se nepodařilo uložit do společné databáze.')
    } catch {
      setSyncState('error')
      alert('Změny se nepodařilo uložit. Zkontrolujte internetové připojení.')
    }
  }
  function chooseStatus(contact, status) {
    const at = new Date().toISOString()
    patch(contact.id, { status, calledAt: at, history: [...(contact.history || []), { at, status, note: contact.note || '' }] })
  }
  function startCall(contact) {
    const at = new Date().toISOString()
    patch(contact.id, { calledAt: at, history: [...(contact.history || []), { at, status: contact.status, note: 'Zahájeno volání' }] })
  }
  function saveContact(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    if (editing?.id) patch(editing.id, values)
    else setContacts(items => [...items, { id: crypto.randomUUID(), type: values.type || type, status: 'new', calledAt: '', followUp: '', history: [], ...values }])
    setEditing(null)
  }
  function exportCsv() {
    const cols = ['type','name','profession','phone','email','address','city','postalCode','district','services','status','calledAt','followUp','note']
    const q = value => `"${String(value ?? '').replaceAll('"','""')}"`
    const csv = '\ufeff' + [cols.join(';'), ...contacts.map(c => cols.map(k => q(c[k])).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'sunpower-kontakty.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (!ready) return <main className="loading">Načítám kontakty…</main>
  return <div className="app-shell">
    <header>
      <div><small>SUNPOWER</small><h1>Kontakty <span className={`sync ${syncState}`}>{onlineSync ? (syncState === 'saving' ? 'ukládám…' : syncState === 'error' ? 'chyba ukládání' : 'online') : 'toto zařízení'}</span></h1></div>
      <div className="header-actions">
        <button className="save-button" onClick={saveNow}>✓ Uložit</button>
        <button className="square" onClick={() => setView(view === 'cards' ? 'table' : 'cards')} aria-label="Změnit zobrazení">{view === 'cards' ? '▦' : '▤'}</button>
        <button className="primary" onClick={() => setEditing(emptyForm)}>＋ Přidat</button>
      </div>
    </header>

    <nav>
      <button className={type === 'elektrikari' ? 'active' : ''} onClick={() => {setType('elektrikari');setIndex(0)}}>⚡ Elektrikáři <b>{contacts.filter(c=>c.type==='elektrikari').length}</b></button>
      <button className={type === 'instalateri' ? 'active' : ''} onClick={() => {setType('instalateri');setIndex(0)}}>💧 Instalatéři <b>{contacts.filter(c=>c.type==='instalateri').length}</b></button>
    </nav>

    <section className="tools">
      <input type="search" placeholder="Hledat jméno, město, telefon…" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0)}} />
      <select value={filter} onChange={e=>{setFilter(e.target.value);setIndex(0)}}><option value="">Všechny stavy</option>{Object.entries(statuses).map(([k,v])=><option value={k} key={k}>{v[0]}</option>)}</select>
    </section>

    <section className="stats">{Object.entries(statuses).map(([key, value]) => <span key={key}>{value[0]}: {list.filter(c=>c.status===key).length}</span>)}</section>

    {view === 'cards' ? <main className="cards-area">
      {current ? <ContactCard key={current.id} contact={current} patch={patch} chooseStatus={chooseStatus} startCall={startCall} edit={setEditing} remove={id=>{if(confirm('Opravdu smazat tento kontakt?'))setContacts(c=>c.filter(x=>x.id!==id))}} /> : <p className="empty">Žádný kontakt neodpovídá filtru.</p>}
    </main> : <ContactTable contacts={list} />}

    {view === 'cards' && <footer><button onClick={()=>setIndex(i=>Math.max(0,i-1))}>← Předchozí</button><strong>{list.length ? Math.min(index+1,list.length) : 0} / {list.length}</strong><button onClick={()=>setIndex(i=>Math.min(list.length-1,i+1))}>Další →</button></footer>}

    <button className="export" onClick={exportCsv}>⇩ <span>Záloha CSV</span></button>
    {editing && <ContactDialog contact={editing} defaultType={type} close={()=>setEditing(null)} save={saveContact} />}
  </div>
}

function ContactCard({ contact:c, patch, chooseStatus, startCall, edit, remove }) {
  const meta = statuses[c.status] || statuses.new
  return <article className={`contact-card ${meta[1]}`}>
    <div className="card-head"><div><h2>{c.name}</h2><p>{c.city || 'Město neuvedeno'}{c.profession ? ` · ${c.profession}` : ''}</p></div><span className="badge">{meta[0]}</span></div>
    <a className="call" href={phoneLink(c.phone)} onClick={()=>startCall(c)}>☎&nbsp; {c.phone}</a>
    <div className="info"><label>Co přesně dělá<strong>{c.services || c.profession || 'neuvedeno'}</strong></label><label>Lokalita<strong>{[c.address, [c.postalCode,c.city].filter(Boolean).join(' '), c.district && `okres ${c.district}`].filter(Boolean).join(', ') || 'neuvedena'}</strong></label><label>E-mail<span>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : 'neuveden'}</span></label>{c.interest && <label>Zájem o<strong>{c.interest}</strong></label>}</div>
    {c.sourceInfo && <details className="source-info"><summary>Původní informace z PDF</summary><p>{c.sourceInfo}</p></details>}
    <div className="status-buttons">{Object.entries(statuses).map(([key,value])=><button className={c.status===key?'selected':''} onClick={()=>chooseStatus(c,key)} key={key}>{value[0]}</button>)}</div>
    <div className="fields">
      <label>Datum hovoru<input type="datetime-local" value={localDateTime(c.calledAt)} onChange={e=>patch(c.id,{calledAt:e.target.value})}/></label>
      <label>Na čem jste se domluvili<textarea rows="4" value={c.note || ''} onChange={e=>patch(c.id,{note:e.target.value})} placeholder="Napište nebo nadiktujte poznámku…"/></label>
      <label>Další kontakt<input type="date" value={c.followUp || ''} onChange={e=>patch(c.id,{followUp:e.target.value})}/></label>
    </div>
    <div className="card-actions"><button onClick={()=>edit(c)}>Upravit kontakt</button><button onClick={()=>remove(c.id)}>Smazat</button></div>
    {!!c.history?.length && <details><summary>Historie ({c.history.length})</summary>{[...c.history].reverse().map((h,i)=><p className="history" key={i}><time>{new Date(h.at).toLocaleString('cs-CZ')}</time><b>{statuses[h.status]?.[0] || h.status}</b>{h.note ? ` — ${h.note}` : ''}</p>)}</details>}
  </article>
}

function ContactTable({ contacts }) {
  return <main className="table-wrap"><table><thead><tr><th>Stav</th><th>Firma / jméno</th><th>Profese</th><th>Co přesně dělá</th><th>Telefon</th><th>Adresa</th><th>Město</th><th>PSČ</th><th>Okres</th><th>Voláno</th><th>Další kontakt</th><th>Poznámka</th></tr></thead><tbody>{contacts.map(c=><tr className={statuses[c.status]?.[1]} key={c.id}><td>{statuses[c.status]?.[0]}</td><td><b>{c.name}</b></td><td>{c.profession}</td><td>{c.services}</td><td><a href={phoneLink(c.phone)}>{c.phone}</a></td><td>{c.address}</td><td>{c.city}</td><td>{c.postalCode}</td><td>{c.district}</td><td>{c.calledAt ? new Date(c.calledAt).toLocaleString('cs-CZ') : ''}</td><td>{c.followUp}</td><td>{c.note}</td></tr>)}</tbody></table></main>
}

function ContactDialog({ contact, defaultType, close, save }) {
  return <div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><form onSubmit={save}>
    <div className="modal-head"><h2>{contact.id ? 'Upravit kontakt' : 'Nový kontakt'}</h2><button type="button" onClick={close}>×</button></div>
    <input type="hidden" name="id" defaultValue={contact.id || ''}/>
    <label>Skupina<select name="type" defaultValue={contact.type || defaultType}><option value="elektrikari">⚡ Elektrikář</option><option value="instalateri">💧 Instalatér</option></select></label>
    <label>Firma nebo jméno<input name="name" required defaultValue={contact.name}/></label>
    <div className="two"><label>Profese<input name="profession" placeholder="Elektrikář / instalatér" defaultValue={contact.profession}/></label><label>Telefon<input name="phone" inputMode="tel" required defaultValue={contact.phone}/></label></div>
    <label>Co přesně dělá<input name="services" placeholder="Např. elektroinstalace, výkopové práce…" defaultValue={contact.services}/></label>
    <label>Ulice / část obce / číslo<input name="address" defaultValue={contact.address}/></label>
    <div className="two"><label>Město / obec<input name="city" defaultValue={contact.city}/></label><label>PSČ<input name="postalCode" inputMode="numeric" defaultValue={contact.postalCode}/></label></div>
    <label>Okres<input name="district" defaultValue={contact.district}/></label>
    <label>E-mail<input name="email" inputMode="email" defaultValue={contact.email}/></label>
    <label>Poznámka<textarea name="note" rows="4" defaultValue={contact.note}/></label>
    <div className="modal-actions"><button type="button" onClick={close}>Zrušit</button><button className="primary">Uložit kontakt</button></div>
  </form></div>
}
