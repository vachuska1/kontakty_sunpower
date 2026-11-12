import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE })
try {
  for (const available of [true, false]) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('sunpower-contacts-v4', JSON.stringify([{ id: '', name: 'Old local copy', history: [] }]))
      localStorage.setItem('sunpower-contacts-v4-meta', JSON.stringify({ pending: true }))
    })
    let writes = 0
    await page.route('**/api/contacts', route => {
      if (route.request().method() !== 'GET') { writes++; return route.fulfill({ status: 500, body: '{}' }) }
      return available
        ? route.fulfill({ json: { contacts: [{id:'server-id', type:'elektrikari', name:'Server copy', phone:'777000001', status:'new', history:[]}], updatedAt:'2026-10-18T10:00:00.000Z' } })
        : route.fulfill({ status:503, json:{ error:'Unavailable' } })
    })
    await page.goto('http://127.0.0.1:3187')
    if (available) await page.getByText('Server copy', {exact:true}).waitFor()
    else await page.getByText(/Společná databáze není dostupná/).waitFor()
    await page.waitForTimeout(1200)
    assert.equal(writes,0)
    assert.equal(await page.getByText('Old local copy', {exact:true}).count(),0)
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sunpower-contacts-v4'))[0].id),'')
    await context.close()
  }
  console.log('PASS: old localStorage is preserved, ignored, and never auto-uploaded; API failure does not load old data')
} finally { await browser.close() }
