import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWebsiteLeadIntent } from './lead-intent.ts'

test('only explicit homepage intent values are accepted for CRM routing', () => {
  assert.equal(normalizeWebsiteLeadIntent('Sell'), 'sell')
  assert.equal(normalizeWebsiteLeadIntent(' buy '), 'buy')
  assert.equal(normalizeWebsiteLeadIntent('Rent'), 'rent')
  assert.equal(normalizeWebsiteLeadIntent('Other'), 'other')
  assert.equal(normalizeWebsiteLeadIntent('seller'), undefined)
  assert.equal(normalizeWebsiteLeadIntent({ intent: 'sell' }), undefined)
})
