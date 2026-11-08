// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import { expect, it } from 'vitest'
import contract from './fixtures/api-extraction-contract.json'

it('preserves every existing public API name and the extracted function bodies', () => {
  const names = [], bodies = {}
  for (const [index, relative] of ['../../api.js', '../shared/readHelpers.js', '../../../domains/developments/readApi.js'].entries()) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
    for (const node of ast.program.body) {
      const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
      if (index === 0 && node.type === 'ExportNamedDeclaration') {
        if (declaration?.type === 'FunctionDeclaration') names.push(declaration.id.name)
        if (declaration?.type === 'VariableDeclaration') for (const item of declaration.declarations) names.push(item.id.name)
        for (const item of node.specifiers || []) names.push(item.exported.name)
      }
      if (declaration?.type === 'FunctionDeclaration') bodies[declaration.id.name] = createHash('sha256').update(source.slice(declaration.start, declaration.end)).digest('hex')
    }
  }
  expect(names.sort()).toEqual(contract.exports)
  for (const [name, hash] of Object.entries(contract.declarations)) expect(bodies[name], `${name} changed during structural extraction`).toBe(hash)
})
