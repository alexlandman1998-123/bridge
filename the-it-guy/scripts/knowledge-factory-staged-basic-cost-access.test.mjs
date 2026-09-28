import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { costs, mayUseStagedBasicCostMatrix } from '../api/knowledge-factory/cost-matrix.js'

const api = await readFile(new URL('../api/knowledge-factory/cost-matrix.js', import.meta.url), 'utf8')
assert.doesNotMatch(api, /operationName:\s*"CostMatrix"/, 'A fixed operation name must not conflict with the Basic package query.')
assert.deepEqual(costs({ extensions: { operationCost: { fieldCost: 12, typeCost: 4, creditsConsumed: 16 } } }), { fieldCost: 12, typeCost: 4, surcharge: null, credits: 16 })
assert.deepEqual(costs({ extensions: { operationCost: { fieldCost: 12, typeCost: 4 } } }), { fieldCost: 12, typeCost: 4, surcharge: null, credits: null })

const staged = {
  organisationAccess: { enabled: false, suspended_at: null, allowed_operations: ['property_report'] },
  userPermission: { revoked_at: null, allowed_operations: ['property_report'] },
  draftProduct: { status: 'draft', cost_validation_recipe_id: 'package_basic_v1' },
}

assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'list' }), true)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_basic_v1' }), true)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_full_v1' }), false)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'execute', recipeId: 'package_basic_v1' }), false)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_basic_v1', organisationAccess: { ...staged.organisationAccess, enabled: true } }), false)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_basic_v1', organisationAccess: { ...staged.organisationAccess, suspended_at: '2026-09-27T00:00:00Z' } }), false)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_basic_v1', userPermission: { ...staged.userPermission, revoked_at: '2026-09-27T00:00:00Z' } }), false)
assert.equal(mayUseStagedBasicCostMatrix({ ...staged, action: 'validate', recipeId: 'package_basic_v1', draftProduct: { ...staged.draftProduct, status: 'uat_validated' } }), false)

console.log('Staged Basic cost validation access guard passed.')
