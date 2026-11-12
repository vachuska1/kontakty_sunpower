import { neon } from '@neondatabase/serverless'
import { validateContacts } from '../../../lib/validation.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function database() {
  if (!process.env.SUNPOWER_DATABASE_URL) return null
  return neon(process.env.SUNPOWER_DATABASE_URL)
}

export async function GET() {
  const sql = database()
  if (!sql) return Response.json({ error: 'Databáze není připojena' }, { status: 503 })
  // GET never creates tables, seeds contacts.json or modifies the live row.
  try {
    const rows = await sql`SELECT contacts, updated_at::text AS revision FROM sunpower_state WHERE id = 1`
    if (!rows.length) return Response.json({ error: 'Společná data nejsou inicializována. Je nutná schválená obnova ze zálohy.' }, { status: 503 })
    return Response.json({ contacts: rows[0].contacts, updatedAt: rows[0].revision, initialized: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Společná data nejsou dostupná.' }, { status: 503 })
  }
}

export async function PUT(request) {
  if (request.headers.get('X-Sunpower-Write-Protocol') !== 'contacts-20261018-v1') return Response.json({ error: 'Obnovte stránku na aktuální verzi aplikace.' }, { status: 426 })
  if (process.env.SUNPOWER_WRITES_PAUSED === '1') return Response.json({ error: 'Probíhá údržba dat; zápisy jsou dočasně pozastaveny.' }, { status: 503 })
  const sql = database()
  if (!sql) return Response.json({ error: 'Databáze není připojena' }, { status: 503 })
  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Neplatný JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return Response.json({ error: 'Neplatná data' }, { status: 400 })
  const validationError = validateContacts(body.contacts)
  if (validationError) return Response.json({ error: validationError }, { status: 400 })
  if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    return Response.json({ error: 'Chybí verze dat' }, { status: 409 })
  }
  const value = JSON.stringify(body.contacts)
  const rows = await sql`WITH previous AS (
    SELECT contacts FROM sunpower_state WHERE id = 1 AND updated_at = ${body.expectedUpdatedAt}::timestamptz FOR UPDATE
  ), backup AS (
    INSERT INTO sunpower_backups (contacts) SELECT contacts FROM previous RETURNING id
  )
  UPDATE sunpower_state SET contacts = ${value}::jsonb, updated_at = clock_timestamp()
  WHERE id = 1 AND updated_at = ${body.expectedUpdatedAt}::timestamptz AND EXISTS (SELECT 1 FROM backup)
  RETURNING updated_at::text AS revision`
  if (!rows.length) return Response.json({ error: 'Data mezitím změnilo jiné zařízení. Nejprve zálohujte místní změny a načtěte serverová data.' }, { status: 409 })
  return Response.json({ ok: true, updatedAt: rows[0].revision })
}
