import test from 'node:test'
import assert from 'node:assert/strict'
import { PUT } from '../app/api/contacts/route.js'

test('legacy clients are rejected before a database connection or payload read', async () => {
  const response = await PUT(new Request('http://localhost/api/contacts', { method: 'PUT', body: '{invalid legacy body' }))
  assert.equal(response.status, 426)
})
