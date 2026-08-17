import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const modalSource = await readFile(new URL('../src/components/AddDevelopmentModal.jsx', import.meta.url), 'utf8')

assert(!modalSource.includes('Developer Access (Required)'), 'Developer Access should not be labelled as required for agent-created developments.')
assert(modalSource.includes('Optionally link an existing developer profile'), 'Developer Access should be presented as optional.')
assert(modalSource.includes('if (!hasDeveloperAccessDraft()) return []'), 'Blank developer access should not create a developer invite/team entry.')
assert(modalSource.includes('isAgentContext && hasDeveloperAccessDraft()'), 'Developer access validation should only run once the agent starts adding access details.')
assert(!modalSource.includes('Select an existing developer profile before continuing.'), 'Blank existing developer access should not block development setup.')

console.log('Developer access optional contract passed.')
