import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { mergeDocumentRequirementRows, readDocumentRequirementContext, watchDocumentRequirementContext, notifyDocumentRequirementContextChanged } from '../documentRequirementReadService.js'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { buildCanonicalDocumentWorkspaceModel } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentWorkspaceService.js')
const { projectCanonicalSellerDocumentRows } = await server.ssrLoadModule('/src/services/documents/canonicalSellerDocumentProjectionService.js')
const requirement = {
  id: 'custom-1', context_type: 'transaction', context_id: 'matter', custom_label: 'Additional SARS communication',
  requirement_origin: 'manual', document_definition_key: null, requested_from_role: 'seller', status: 'under_review',
  requirement_level: 'required', pack_key: 'seller_identity_fica', visible_to_roles: ['seller', 'agent'], uploadable_by_roles: ['seller', 'agent'],
  satisfied_by_document_id: 'new-file', command_revision: 3,
}
const evidence = [
  { id: 'old-file', file_path: 'old.pdf', canonical_requirement_instance_id: requirement.id, is_current_evidence: false, status: 'approved' },
  { id: 'new-file', file_path: 'new.pdf', canonical_requirement_instance_id: requirement.id, is_current_evidence: true, status: 'under_review' },
]
const snapshot = { contextType: 'transaction', contextId: 'matter', requirements: [requirement], documents: evidence, version: 4 }

test('shared read checks scope and shape and never converts failure into an empty checklist', async () => {
  assert.equal((await readDocumentRequirementContext({ rpc: async () => ({ data: snapshot }) }, { contextType: 'transaction', contextId: 'matter' })).version, 4)
  await assert.rejects(readDocumentRequirementContext({ rpc: async () => ({ data: { ...snapshot, contextId: 'other' } }) }, { contextType: 'transaction', contextId: 'matter' }), /could not be verified/)
  await assert.rejects(readDocumentRequirementContext({ rpc: async () => ({ error: new Error('Permission denied') }) }, { contextType: 'transaction', contextId: 'matter' }), /Permission denied/)
})

test('current review state overrides stale approved mirrors and removal prevents reappearance', () => {
  const legacy = [{ id: 'legacy', canonical_requirement_instance_id: requirement.id, label: 'Old title', status: 'approved' }, { id: 'unrelated', key: 'other' }]
  const rows = mergeDocumentRequirementRows(legacy, snapshot, { party: 'seller' })
  assert.equal(rows.length, 2)
  const current = rows.find(row => row.sharedRequirement)
  assert.equal(current.status, 'under_review')
  assert.equal(current.label, requirement.custom_label)
  assert.equal(current.storagePath, 'new.pdf')
  const removed = mergeDocumentRequirementRows(legacy, { ...snapshot, requirements: [{ ...requirement, applicability_override: 'removed', status: 'not_applicable' }] }, { party: 'seller' })
  assert.deepEqual(removed.map(row => row.id), ['unrelated'])
})

test('legacy standard matches require an exact party/contact; labels and multiple-person slots never merge', () => {
  const standard = { ...requirement, id: 'standard', custom_label: null, document_definition_key: 'seller_id_document', requested_from_contact_id: null }
  assert.equal(mergeDocumentRequirementRows([{ key: 'seller_id_document' }], { ...snapshot, requirements: [{ ...standard, status: 'not_applicable', applicability_override: 'removed' }] }, { party: 'seller' }).length, 0)
  const rows = mergeDocumentRequirementRows([{ key: 'seller_id_document', label: 'Seller ID' }], { ...snapshot, requirements: [
    { ...standard, id: 'person-1', requested_from_contact_id: 'one' }, { ...standard, id: 'person-2', requested_from_contact_id: 'two' },
  ] }, { party: 'seller' })
  assert.equal(rows.length, 3)
})

test('seller projection retains separate same-name custom slots and exact person identities', () => {
  const rows = mergeDocumentRequirementRows([], { ...snapshot, requirements: [requirement, { ...requirement, id: 'custom-2' }] }, { party: 'seller' })
  const projected = projectCanonicalSellerDocumentRows(rows)
  assert.equal(projected.length, 2)
  assert.notEqual(projected[0].canonicalRequirementIdentity, projected[1].canonicalRequirementIdentity)
  assert(projected.every(row => row.label === requirement.custom_label))
})

test('canonical workspace displays custom labels, keeps distinct slots and uses latest file without inheriting old approval', () => {
  const model = buildCanonicalDocumentWorkspaceModel({ requirements: [requirement, { ...requirement, id: 'custom-2', satisfied_by_document_id: null }], documentCenter: { uploadedDocuments: evidence }, role: 'seller' })
  assert.equal(model.requirements.length, 2)
  const row = model.requirements.find(r => r.id === requirement.id)
  assert.equal(row.title, requirement.custom_label)
  assert.equal(row.linkedDocument.id, 'new-file')
  assert.equal(row.status, 'under_review')
  assert.equal(model.needsReview.length, 2)
  const removed = buildCanonicalDocumentWorkspaceModel({ requirements: [{ ...requirement, status: 'not_applicable', applicability_override: 'removed' }], role: 'seller' })
  assert.equal(removed.requirements.length, 0)
})

test('focus, shared-save event and polling refresh; cleanup stops every listener and timer', () => {
  const listeners = new Map(), callbacks = new Map(); let calls = 0
  const target = { document: { visibilityState: 'visible' },
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
    setInterval: callback => { callbacks.set(1, callback); return 1 }, clearInterval: id => callbacks.delete(id),
  }
  const stop = watchDocumentRequirementContext(() => calls++, { target })
  listeners.get('focus')(); listeners.get('arch9:document-requirements-changed')(); callbacks.get(1)()
  assert.equal(calls, 3)
  target.document.visibilityState = 'hidden'; callbacks.get(1)(); assert.equal(calls, 3)
  stop(); assert.equal(listeners.size, 0); assert.equal(callbacks.size, 0)
})

test('summary fields follow canonical review status rather than mere file presence', () => {
  const pending = mergeDocumentRequirementRows([], snapshot)[0]
  assert.equal(pending.complete, false)
  assert.equal(pending.statusBucket, 'under_review')
  assert.equal(pending.category, 'seller')
  const approved = mergeDocumentRequirementRows([], { ...snapshot, requirements: [{ ...requirement, status: 'approved' }] })[0]
  assert.equal(approved.complete, true)
  assert.equal(approved.statusBucket, 'approved')
})

test('slow refreshes are not overlapped by another poll', async () => {
  let callback, finish, count = 0
  const target = { addEventListener() {}, removeEventListener() {}, setInterval(fn) { callback = fn; return 1 }, clearInterval() {} }
  const stop = watchDocumentRequirementContext(() => { count++; return new Promise(resolve => { finish = resolve }) }, { target })
  callback(); callback(); assert.equal(count, 1)
  finish(); await new Promise(resolve => setTimeout(resolve, 0))
  callback(); assert.equal(count, 2); finish(); stop()
})

test('buyer custom requirements expose the stable canonical upload target', () => {
  const model = buildCanonicalDocumentWorkspaceModel({ requirements: [{ ...requirement, requested_from_role: 'buyer', pack_key: 'buyer_identity_fica', visible_to_roles: ['buyer'], uploadable_by_roles: ['buyer'], status: 'pending', satisfied_by_document_id: null }], role: 'buyer' })
  assert.equal(model.requirements[0].canUpload, true)
  assert.equal(model.requirements[0].uploadSpec.requirementInstanceId, requirement.id)
  assert.equal(model.requirements[0].uploadSpec.requirementKey, `custom_${requirement.id}`)
})

test('saved documents refresh other open tabs without copying private document data', () => {
  const listeners = new Map(), storage = new Map(), events = []; let calls = 0
  const target = {
    document: { visibilityState: 'visible' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    dispatchEvent: event => { events.push(event); listeners.get(event.type)?.(event) },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
    setInterval: () => 1, clearInterval() {},
  }
  const stop = watchDocumentRequirementContext(() => calls++, { target })
  notifyDocumentRequirementContextChanged([{ contextType: 'seller_lead', contextId: 'lead' }], { target })
  assert.equal(calls, 1)
  assert.equal(events[0].type, 'arch9:document-requirements-changed')
  assert.equal(storage.size, 1)
  assert.doesNotMatch([...storage.values()][0], /lead|seller|pdf/)
  listeners.get('storage')({ key: 'unrelated' }); assert.equal(calls, 1)
  listeners.get('storage')({ key: 'arch9:document-requirements-changed' }); assert.equal(calls, 2)
  stop(); assert.equal(listeners.size, 0)
  assert.doesNotThrow(() => notifyDocumentRequirementContextChanged(null, { target: { dispatchEvent() { throw Error('unavailable') }, CustomEvent: target.CustomEvent } }))
})
