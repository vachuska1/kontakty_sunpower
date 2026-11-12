// Authorized one-time import. Never connects to the original production database.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv, isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { neon } from '@neondatabase/serverless'
import { verifyRepair, counts } from './repair-empty-ids.mjs'
const label='2026-10-18-migration'
const manifest=JSON.parse(readFileSync(`backups/live-contacts-backup-manifest-${label}.json`))
for(const f of manifest.files) assert.equal(createHash('sha256').update(readFileSync(f.path)).digest('hex'),f.sha256)
const before=JSON.parse(readFileSync(`backups/live-contacts-before-id-repair-${label}.json`))
const after=JSON.parse(readFileSync(`backups/live-contacts-id-repair-prepared-${label}.json`))
const report=verifyRepair(before,after)
assert.equal(report.changedFields,14);assert.equal(report.before.contacts,178);assert.equal(report.before.historyRecords,209)
const live=await fetch('https://kontaktysunpower.vercel.app/api/contacts',{cache:'no-store'})
assert.ok(live.ok);assert.ok(isDeepStrictEqual((await live.json()).contacts,before.contacts),'Production contacts changed; stop')
const env=parseEnv(readFileSync('.env.local','utf8'))
assert.equal(new URL(env.DATABASE_URL).hostname,'ep-wispy-truth-b95hy6iu-pooler.c-7.eu-central-1.aws.neon.tech')
const sql=neon(env.DATABASE_URL)
const [check]=await sql.transaction([sql`SELECT (SELECT count(*) FROM sunpower_state)::int AS states,(SELECT count(*) FROM sunpower_backups)::int AS backups`],{readOnly:true})
assert.equal(check[0].states,0);assert.equal(check[0].backups,0)
const value=JSON.stringify(after.contacts)
const inserted=await sql`INSERT INTO sunpower_state (id,contacts) SELECT 1,${value}::jsonb WHERE NOT EXISTS (SELECT 1 FROM sunpower_state) ON CONFLICT DO NOTHING RETURNING id`
assert.equal(inserted.length,1,'Import did not insert exactly one row')
const [rows]=await sql.transaction([sql`SELECT contacts,updated_at::text AS revision FROM sunpower_state WHERE id=1`],{readOnly:true})
assert.equal(rows.length,1);assert.ok(isDeepStrictEqual(rows[0].contacts,after.contacts),'Persisted data differs')
verifyRepair(before,{...before,contacts:rows[0].contacts})
const result={project:'sweet-water-84423225',imported:true,counts:counts(rows[0].contacts),allOtherFieldsAndOrderPreserved:true,revision:rows[0].revision,originalDatabaseWrites:0}
writeFileSync(`backups/new-neon-import-${label}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(result))
