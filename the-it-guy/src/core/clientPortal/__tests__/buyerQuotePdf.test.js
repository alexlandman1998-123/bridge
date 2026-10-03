import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchBuyerQuotePdf } from '../buyerQuotePdf.js'
test('resolves a fresh signed URL per download and returns PDF bytes', async () => {
  let reads = 0
  const resolveQuote = async () => ({ url: `https://example.test/quote?read=${++reads}`, name: 'Bank quote.pdf' })
  const requested = []
  const fetchFile = async (url, options) => { requested.push(url); assert.equal(options.credentials,'omit'); return new Response('%PDF-1.4\nquote') }
  const args = { offer: { bankName: 'Nedbank' }, resolveQuote, fetchFile }
  const first = await fetchBuyerQuotePdf(args)
  await fetchBuyerQuotePdf(args)
  assert.equal(first.name,'Bank quote.pdf')
  assert.notEqual(requested[0],requested[1])
  assert.match(await first.blob.text(),/^%PDF-/)
})
test('propagates denied/withdrawn access and rejects unsuccessful or non-PDF downloads', async () => {
  await assert.rejects(fetchBuyerQuotePdf({offer:{},resolveQuote:async()=>{throw Error('Withdrawn')}}),/Withdrawn/)
  const resolveQuote = async () => ({url:'https://example.test/quote'})
  await assert.rejects(fetchBuyerQuotePdf({offer:{},resolveQuote,fetchFile:async()=>new Response('denied',{status:403})}),/could not be downloaded/)
  await assert.rejects(fetchBuyerQuotePdf({offer:{},resolveQuote,fetchFile:async()=>new Response('<html>expired</html>')}),/PDF/)
})
