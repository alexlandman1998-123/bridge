import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const readinessPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountReadiness.js')
const apiPath = path.join(repoRoot, 'src/lib/api.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const statementPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountStatement.js')

const readinessSource = fs.readFileSync(readinessPath, 'utf8')
const apiSource = fs.readFileSync(apiPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const statementSource = fs.readFileSync(statementPath, 'utf8')

assert.match(readinessSource, /export function evaluateMatterFinancialAccountReadiness/, 'Phase 6 must expose per-account readiness evaluation')
assert.match(readinessSource, /export function summarizeMatterFinancialAccountReadiness/, 'Phase 6 must expose readiness summary rollup')
assert.match(readinessSource, /Portal visibility is paused/, 'Readiness must block disabled portal accounts')
assert.match(readinessSource, /Payment instructions are not published while a balance is due/, 'Readiness must block unpaid accounts without published instructions')
assert.match(readinessSource, /Published payment instructions are missing core banking details/, 'Readiness must validate published banking details')
assert.match(readinessSource, /proofsNeedingReview/, 'Readiness must count unreconciled proof uploads')
assert.match(readinessSource, /draftDocumentCount/, 'Readiness must count draft documents')
assert.match(readinessSource, /status === 'ready' \? 'Ready'/, 'Readiness must produce a user-facing label')

assert.match(apiSource, /evaluateMatterFinancialAccountReadiness/, 'API must import readiness evaluation')
assert.match(apiSource, /readiness: evaluateMatterFinancialAccountReadiness\(account\)/, 'Account view models must include readiness')
assert.match(apiSource, /summarizeMatterFinancialAccountReadiness\(accounts\)/, 'Account summary must include readiness rollup')
assert.match(apiSource, /readyAccounts/, 'API summary must expose ready account count')
assert.match(apiSource, /blockedAccounts/, 'API summary must expose blocked account count')
assert.match(apiSource, /proofsNeedingReview/, 'API summary must expose proof-review count')

assert.match(attorneyPanelSource, /readinessClass/, 'Attorney panel must style readiness states')
assert.match(attorneyPanelSource, /Launch ready/, 'Attorney panel summary must show launch readiness')
assert.match(attorneyPanelSource, /Launch checklist/, 'Attorney account cards must show readiness checklist')
assert.match(attorneyPanelSource, /Launch readiness/, 'Attorney detail cards must show readiness details')
assert.match(attorneyPanelSource, /This account is ready for buyer\/seller portal operation/, 'Attorney panel must show ready state')

assert.match(statementSource, /Readiness/, 'Statement export must include readiness status')
assert.match(statementSource, /Readiness issues/, 'Statement export must include readiness issues')
assert.match(statementSource, /Readiness warnings/, 'Statement export must include readiness warnings')

console.log('Attorney accounting Phase 6 readiness contract checks passed.')
