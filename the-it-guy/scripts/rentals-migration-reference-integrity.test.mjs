import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const scriptsDirectory = join(appRoot, 'scripts')
const migrationDirectory = join(appRoot, '..', 'supabase', 'migrations')
const rentalTestFiles = (await readdir(scriptsDirectory)).filter((name) => /^rentals-.*\.test\.mjs$/.test(name))
const missingReferences = []

for (const fileName of rentalTestFiles) {
  const source = await readFile(join(scriptsDirectory, fileName), 'utf8')
  const references = source.matchAll(/supabase\/migrations\/([\w-]+\.sql)/g)

  for (const [, migrationName] of references) {
    try {
      await access(join(migrationDirectory, migrationName), constants.R_OK)
    } catch {
      missingReferences.push(`${fileName} → ${migrationName}`)
    }
  }
}

assert.deepEqual(
  missingReferences,
  [],
  `Rental release checks reference missing migrations:\n${missingReferences.join('\n')}`,
)

console.log(`Rental migration reference integrity passed (${rentalTestFiles.length} test files scanned).`)
