// Test-only source access for historical contracts after the runtime facade was retired.
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import contract from '../../src/lib/api/__tests__/fixtures/domain-api-contract.json' with { type: 'json' }

const appRoot = resolve(import.meta.dirname, '../..')
const oldLocation = resolve(appRoot, 'src/lib/api.js')

// Historical source contracts follow the owners of the implementation, while
// runtime callers continue to use the unchanged service facades.
export function readLeadServiceSource(location) {
  const file = location instanceof URL ? fileURLToPath(location) : String(location)
  const match = file.match(/(agencyPipeline|buyerLifecycle)Service\.js$/)
  if (!match) throw new Error(`Unknown lead service source: ${file}`)
  return ['Model', 'Workflow'].map(kind => readFileSync(
    resolve(dirname(file), `${match[1]}${kind}.js`), 'utf8',
  )).join('\n')
}

export function canonicalDeclaration(source, location) {
  const ast = parse(source, { sourceType: 'module' })
  const edits = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && node.callee.type === 'Import' && node.arguments[0]?.type === 'StringLiteral' && node.arguments[0].value.startsWith('.')) {
      const arg = node.arguments[0]
      const target = relative(appRoot, resolve(dirname(location), arg.value)).replaceAll('\\', '/')
      edits.push({ start: arg.start, end: arg.end, text: JSON.stringify(target) })
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(ast)
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

export function readDomainDeclarations() {
  const result = new Map()
  for (const module of new Set(contract.declarations.map(item => item.module))) {
    const location = resolve(appRoot, module)
    const source = readFileSync(location, 'utf8')
    const ast = parse(source, { sourceType: 'module' })
    for (const node of ast.program.body) {
      const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
      if (!declaration) continue
      const names = declaration.type === 'FunctionDeclaration' ? [declaration.id.name]
        : declaration.type === 'VariableDeclaration' ? declaration.declarations.flatMap(item => item.id.type === 'Identifier' ? [item.id.name] : Object.values(item.id.properties || {}).map(property => property.value?.name).filter(Boolean)) : []
      const text = source.slice(declaration.start, declaration.end)
      for (const name of names) result.set(name, { source: text, module, location })
      if (!names.length && declaration.type !== 'ImportDeclaration') result.set(`${module}:${declaration.type}`, { source: text, module, location })
    }
  }
  return result
}

export function readDomainApiSource() {
  const declarations = readDomainDeclarations()
  const chunks = contract.header.slice()
  for (const item of contract.declarations) {
    const record = declarations.get(item.names[0] || `${item.module}:${item.kind}`)
    if (!record) throw new Error(`Missing retired API declaration: ${item.names.join(', ') || item.kind}`)
    let source = record.source
    // Restore relative import spelling for old source-evaluation harnesses only.
    const canonical = canonicalDeclaration(source, record.location)
    source = canonical.replace(/import\("(src|server)\/([^\"]+)"\)/g, (_match, directory, rest) => {
      let target = relative(dirname(oldLocation), resolve(appRoot, directory, rest)).replaceAll('\\', '/')
      if (!target.startsWith('.')) target = `./${target}`
      return `import('${target}')`
    })
    chunks.push(`${item.exported ? 'export ' : ''}${source}`)
  }
  for (const module of contract.supportingModules || []) {
    chunks.push(readFileSync(resolve(appRoot, module), 'utf8'))
  }
  return chunks.join('\n\n')
}

// Evaluate named declarations with explicit fixture dependencies. Slicing the
// synthetic historical source between unrelated functions is not valid ESM.
export function readDomainDeclarationSource(...names) {
  const declarations = readDomainDeclarations()
  return names.map(name => {
    let declaration = declarations.get(name)
    if (!declaration) {
      for (const module of contract.supportingModules || []) {
        const source = readFileSync(resolve(appRoot, module), 'utf8')
        const ast = parse(source, { sourceType: 'module' })
        const node = ast.program.body.map(node => node.declaration || node).find(node => node.id?.name === name)
        if (node) { declaration = { source: source.slice(node.start, node.end) }; break }
      }
    }
    if (!declaration) throw new Error(`Missing API declaration: ${name}`)
    return declaration.source
  }).join('\n\n')
}
