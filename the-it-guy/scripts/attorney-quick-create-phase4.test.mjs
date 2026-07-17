import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8')
const attorneyStart = source.indexOf('const ATTORNEY_QUICK_CREATE_GROUPS')
const attorneyEnd = source.indexOf('const BOND_ORIGINATOR_QUICK_CREATE_GROUPS')
const attorneyConfig = source.slice(attorneyStart, attorneyEnd)

assert.match(source, /import \{ can \} from ['"]\.\.\/auth\/permissions\/permissionResolver['"]/)
assert.match(source, /import \{ PERMISSIONS \} from ['"]\.\.\/auth\/permissions\/permissionRegistry['"]/)
assert.equal(
  (attorneyConfig.match(/permission:\s*PERMISSIONS\.createMatters/g) || []).length,
  2,
  'Matter and Lead creation should require create-matters permission',
)
assert.equal(
  (attorneyConfig.match(/permission:\s*PERMISSIONS\.manageSigningAppointments/g) || []).length,
  1,
  'Appointment creation should require scheduling permission',
)
assert.match(source, /group\.items[\s\S]*?\.filter\(\(item\) => !item\.permission \|\| can\(item\.permission, workspaceContext\)\)/)
assert.match(source, /\.filter\(\(group\) => group\.items\.length\)/)
assert.match(source, /if \(role === 'attorney' && !quickCreateGroups\.length\) return null/)

console.log('Attorney quick-create Phase 4 checks passed.')
