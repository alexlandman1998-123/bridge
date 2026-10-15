import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveBuyerDocumentStatus } from '../../core/clientPortal/buyerDocumentPresentationModel.js'

const source = readFileSync(new URL('../ClientPortal.jsx', import.meta.url), 'utf8')
const start = source.indexOf('function getBuyerMobileDocumentBucket(')
const end = source.indexOf('\nfunction resolveBuyerMobileDocumentUploadTarget(', start)
assert.ok(start >= 0 && end > start)
const bucket = Function('resolveBuyerDocumentStatus', 'normalizePortalStatus', `return (${source.slice(start,end)})`)(resolveBuyerDocumentStatus, value => String(value || '').toLowerCase())

test('mobile buyer optional requests do not become pending actions', () => {
  assert.equal(bucket({ status: 'required', required: false, uploadSpec: {} }), 'optional')
  assert.equal(bucket({ status: 'requested', requirementLevel: 'recommended', uploadSpec: {} }), 'optional')
  assert.equal(bucket({ status: 'required', required: true, uploadSpec: {} }), 'action')
})

test('mobile buyer received and approved optional files retain their actual review state', () => {
  assert.equal(bucket({ status: 'uploaded', required: false }), 'review')
  assert.equal(bucket({ status: 'approved', required: false }), 'approved')
})
