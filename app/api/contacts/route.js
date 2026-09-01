import { neon } from '@neondatabase/serverless'
import initialContacts from '../../../public/contacts.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function database() {
  if (!process.env.DATABASE_URL) return null
  return neon(process.env.DATABASE_URL)
}

async function prepare(sql) {
  await sql`CREATE TABLE IF NOT EXISTS sunpower_state (
    id INTEGER PRIMARY KEY,
    contacts JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
}

export async function GET() {
  const sql = database()
  if (!sql) return Response.json({ error: 'Databáze není připojena' }, { status: 503 })
  await prepare(sql)
  let rows = await sql`SELECT contacts, updated_at FROM sunpower_state WHERE id = 1`
  if (!rows.length) {
    const value = JSON.stringify(initialContacts)
    rows = await sql`INSERT INTO sunpower_state (id, contacts) VALUES (1, ${value}::jsonb)
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING contacts, updated_at`
  }
  return Response.json({ contacts: rows[0].contacts, updatedAt: rows[0].updated_at }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request) {
  const sql = database()
  if (!sql) return Response.json({ error: 'Databáze není připojena' }, { status: 503 })
  const body = await request.json()
  if (!Array.isArray(body.contacts) || body.contacts.length > 5000) {
    return Response.json({ error: 'Neplatná data kontaktů' }, { status: 400 })
  }
  await prepare(sql)
  const value = JSON.stringify(body.contacts)
  const rows = await sql`INSERT INTO sunpower_state (id, contacts, updated_at)
    VALUES (1, ${value}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET contacts = EXCLUDED.contacts, updated_at = NOW()
    RETURNING updated_at`
  return Response.json({ ok: true, updatedAt: rows[0].updated_at })
}
