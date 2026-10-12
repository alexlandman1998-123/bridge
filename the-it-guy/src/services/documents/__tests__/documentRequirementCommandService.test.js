import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { addDocumentRequirement, executeDocumentRequirementCommand, prepareDocumentRequirementUpload, uploadDocumentRequirementFile } from '../documentRequirementCommandService.js'

const contextId = randomUUID(), requirementId = randomUUID(), actorId = randomUUID()
const newCommand = () => ({ commandId: randomUUID(), contextType: 'transaction', contextId, payload: { party: 'buyer', label: 'Divorce papers' } })
const uploadId = randomUUID()
const saved = command => ({ saved: true, commandId: command.commandId, requirement: { id: requirementId }, uploadId: command.action === 'upload' ? uploadId : null })
const file = text => new File([text], 'divorce papers.pdf', { type: 'application/pdf' })
const prepare = input => prepareDocumentRequirementUpload(input, { commandId: randomUUID(), actorId, requirementId, contextId, contextType: 'transaction', expectedRevision: 3 })

test('commands retain caller retry ID and envelope; missing IDs fail before network', async () => {
  const command = newCommand(), calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: saved(command) } } }
  assert.equal((await addDocumentRequirement(client, command)).saved, true)
  await addDocumentRequirement(client, command)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(calls[0].args.p_action, 'add')
  await assert.rejects(addDocumentRequirement(client, { ...command, commandId: null }), /stable command ID/)
  assert.equal(calls.length, 2)
})

test('transport failures and malformed success are unconfirmed; definite database rejections are preserved', async () => {
  const command = newCommand()
  for (const client of [
    { rpc: async () => { throw new TypeError('Network lost') } },
    { rpc: async () => ({ data: {} }) },
    { rpc: async () => ({ error: { code: '08006' } }) },
  ]) await assert.rejects(executeDocumentRequirementCommand(client, command), error => error.code === 'document_save_unconfirmed')
  await assert.rejects(executeDocumentRequirementCommand({ rpc: async () => ({ error: { code: '40001', message: 'Reload' } }) }, command), error => error.code === '40001')
})

test('an upload receipt must identify both the exact requirement and a saved file before claiming Uploaded', async () => {
  const command = await prepare(file('mandate'))
  for (const response of [{ ...saved(command), uploadId: null }, { ...saved(command), requirement: { id: randomUUID() } }]) {
    const client = { rpc: async () => ({ data: response }) }
    await assert.rejects(executeDocumentRequirementCommand(client, command), { code: 'document_save_unconfirmed' })
  }
})

test('prepare validates and hashes bytes; private upload is immutable and database confirmation uses same envelope', async () => {
  const input = file('papers'), command = await prepare(input), calls = []
  assert.match(command.payload.filePath, /^document-requirements\//)
  assert.equal(command.payload.fileName, 'divorce-papers.pdf')
  assert.match(command.payload.sha256, /^[a-f0-9]{64}$/)
  const client = {
    rpc: async (name) => { calls.push(name); return { data: name.endsWith('_receipt') ? null : saved(command) } },
    storage: { from: bucket => ({ upload: async (path, bytes, options) => {
      calls.push('upload'); assert.equal(bucket, 'documents'); assert.equal(path, command.payload.filePath)
      assert.equal(options.upsert, false); assert.equal(options.metadata.sha256, command.payload.sha256)
      assert.equal(await bytes.text(), 'papers'); return { data: { path } }
    } }) },
  }
  assert.equal((await uploadDocumentRequirementFile(client, command, input)).saved, true)
  assert.deepEqual(calls, ['bridge_document_requirement_command_receipt', 'upload', 'bridge_document_requirement_command'])
  await assert.rejects(uploadDocumentRequirementFile(client, command, file('other!')), /same file/)
})

test('saved receipt recovers without a file or another storage upload and still validates the command server-side', async () => {
  const command = await prepare(file('papers')), calls = []
  const client = { rpc: async name => { calls.push(name); return { data: name.endsWith('_receipt') ? { result: saved(command) } : saved(command) } } }
  assert.equal((await uploadDocumentRequirementFile(client, command, null)).saved, true)
  assert.deepEqual(calls, ['bridge_document_requirement_command_receipt', 'bridge_document_requirement_command'])
})

test('an unfinished upload asks for its original file after checking the saved receipt', async () => {
  const command = await prepare(file('papers')), calls = []
  const client = { rpc: async name => { calls.push(name); return { data: null } } }
  await assert.rejects(uploadDocumentRequirementFile(client, command, null), error => error.code === 'upload_file_required')
  assert.deepEqual(calls, ['bridge_document_requirement_command_receipt'])
})

test('uncertain upload/save never deletes bytes; duplicate storage path can finish the original save', async () => {
  const input = file('papers'), command = await prepare(input)
  let databaseError = true, duplicate = false, deletes = 0
  const client = {
    rpc: async name => name.endsWith('_receipt') ? { data: null } : databaseError ? { error: { code: '08006' } } : { data: saved(command) },
    storage: { from: () => ({ upload: async () => duplicate ? { error: { statusCode: '409' } } : { data: {} }, remove: async () => { deletes++ } }) },
  }
  await assert.rejects(uploadDocumentRequirementFile(client, command, input), error => error.code === 'document_save_unconfirmed')
  databaseError = false; duplicate = true
  assert.equal((await uploadDocumentRequirementFile(client, command, input)).saved, true)
  assert.equal(deletes, 0)
})
