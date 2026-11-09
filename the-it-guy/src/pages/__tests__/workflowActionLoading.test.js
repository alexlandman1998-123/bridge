// @vitest-environment node
import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import { expect, it, vi } from 'vitest'

const targets = [
  ['Pipeline.jsx', 'loadPipelineApiActions', 'pipelineApiActionsPromise', 'createTransactionFromWizard', '../domains/transactions/creationApi.js'],
  ['Clients.jsx', 'loadLegacyClientApi', 'legacyClientApiPromise', 'createClientRecord', '../domains/transactions/developerWorkspaceActions.js'],
  ['agency/AgencyPipelinePage.jsx', 'loadTransactionApiActions', 'transactionApiActionsPromise', 'uploadDocument', '../../domains/documents/uploadWorkflow.js'],
]

it.each(targets)('%s loads only the requested action and preserves arguments, results and errors', async (file, name, cache, method, expectedModule) => {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const node = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  const implementation = source.slice(node.start, node.end).replaceAll(/\bimport\(/g, 'load(')
  const result = { id: 'saved-record' }
  const action = vi.fn().mockResolvedValue(result)
  const load = vi.fn().mockResolvedValue({ [method]: action })
  const open = new Function('load', `let ${cache} = null; ${implementation}; return ${name}`)(load)
  const namespace = await open()
  expect(await open()).toBe(namespace)
  expect(load).not.toHaveBeenCalled()
  const payload = { id: 'record', file: { name: 'evidence.pdf' } }
  expect(await namespace[method](payload, { retry: true })).toBe(result)
  expect(load.mock.calls).toEqual([[expectedModule]])
  expect(action).toHaveBeenCalledWith(payload, { retry: true })
  const error = new Error('Save needs retry')
  action.mockRejectedValueOnce(error)
  await expect(namespace[method](payload)).rejects.toBe(error)
})
