import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const loaders = await readFile(join(root, 'src/modules/rentals/shell/rentalRouteLoaders.js'), 'utf8')
const names = [...loaders.matchAll(/pages\/rentals\/([A-Za-z0-9]+)'\)/g)].map((match) => match[1])
assert.ok(names.length > 0, 'No Rentals lazy routes were discovered.')

for (const name of names) {
  const page = await readFile(join(root, `src/pages/rentals/${name}.jsx`), 'utf8')
  assert.match(page, /\bexport default(?: function| [A-Za-z0-9]+)/, `${name} is lazy-loaded but has no default export.`)
}

console.log(`Rentals lazy-route export checks passed for ${names.length} pages.`)
