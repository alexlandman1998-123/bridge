import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRef = 'abcdefghijklmnopqrst'
const valid = spawnSync(process.execPath, ['scripts/mvp-staging-environment-check.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    MVP_TARGET_ENV: 'staging',
    MVP_STAGING_PROJECT_REF: projectRef,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_ANON_KEY: 'test-backend-key',
    VITE_SUPABASE_ANON_KEY: 'test-frontend-key',
  },
})
assert.equal(valid.status, 0, valid.stderr)
assert.equal(JSON.parse(valid.stdout).decision, 'staging_environment_confirmed')

const invalid = spawnSync(process.execPath, ['scripts/mvp-staging-environment-check.mjs'], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, MVP_TARGET_ENV: 'production' } })
assert.equal(invalid.status, 1)
assert.equal(JSON.parse(invalid.stdout).blockers.includes('target_environment_must_be_staging'), true)

console.log('MVP staging environment checks passed.')
