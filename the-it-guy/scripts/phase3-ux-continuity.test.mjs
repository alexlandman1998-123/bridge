import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function createLocalStorageMock() {
  const entries = new Map()
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear(),
  }
}

global.window = {
  localStorage: createLocalStorageMock(),
  addEventListener: () => {},
  removeEventListener: () => {},
}

const {
  MOBILE_CREATE_DRAFTS_STORAGE_KEY,
  clearMobileCreateDraft,
  getMobileCreateDraft,
  getMobileCreateDrafts,
  getMobileFieldModeSnapshot,
  saveMobileCreateDraft,
} = await import('../src/services/mobileProductivityService.js')

const saved = saveMobileCreateDraft({
  type: 'lead',
  route: '/mobile/leads',
  module: 'lead',
  title: 'Jane Buyer',
  form: {
    primary: 'Jane Buyer',
    secondary: '082 555 0101',
    notes: 'Looking in Brooklyn',
  },
})

assert.equal(saved.title, 'Jane Buyer', 'create draft should preserve a useful title')
assert.equal(saved.status, 'unfinished', 'create draft should be marked unfinished')
assert.equal(saved.module, 'lead', 'create draft should keep module for filtering')

const restored = getMobileCreateDraft({ type: 'lead', route: '/mobile/leads' })
assert.equal(restored.form.notes, 'Looking in Brooklyn', 'create draft should restore typed notes')
assert.equal(getMobileCreateDrafts().length, 1, 'stored create draft should be listed')

let snapshot = getMobileFieldModeSnapshot()
assert.equal(snapshot.unfinishedCaptures, 1, 'field mode should count unfinished captures')
assert.equal(snapshot.pendingDrafts, 1, 'field mode should include unfinished captures in pending draft pressure')
assert.equal(snapshot.checks[0].status, '1 pending', 'offline capture check should include unfinished captures')

clearMobileCreateDraft({ type: 'lead', route: '/mobile/leads' })
assert.equal(getMobileCreateDrafts().length, 0, 'clearing a create draft should remove it')

window.localStorage.setItem(MOBILE_CREATE_DRAFTS_STORAGE_KEY, JSON.stringify({
  'old:/mobile/leads': {
    id: 'old',
    key: 'old:/mobile/leads',
    type: 'lead',
    module: 'lead',
    route: '/mobile/leads',
    title: 'Old draft',
    form: { primary: 'Old draft', secondary: '', notes: '' },
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  },
}))
assert.equal(getMobileCreateDrafts().length, 0, 'stale create drafts should be pruned automatically')

const createSheetSource = readFileSync(new URL('../src/components/mobile-shell/MobileCreateSheet.jsx', import.meta.url), 'utf8')
assert.match(createSheetSource, /MobileCreateRecoveryStrip/, 'mobile create sheet module should export the recovery strip')
assert.match(createSheetSource, /data-mobile-create-recovery/, 'recovery strip should expose a stable marker')
assert.match(createSheetSource, /data-mobile-create-durable-draft/, 'create sheet should show durable draft status')
assert.match(createSheetSource, /Saved on this device/, 'create sheet should tell users their partial work is preserved')

const modulePageSource = readFileSync(new URL('../src/pages/mobile/MobileModulePage.jsx', import.meta.url), 'utf8')
const tasksSource = readFileSync(new URL('../src/pages/mobile/MobileTasksPage.jsx', import.meta.url), 'utf8')
const activitySource = readFileSync(new URL('../src/pages/mobile/MobileActivityPage.jsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../src/pages/mobile/MobileHome.jsx', import.meta.url), 'utf8')
assert.match(modulePageSource, /MobileCreateRecoveryStrip/, 'mobile module pages should surface unfinished captures')
assert.match(tasksSource, /MobileCreateRecoveryStrip moduleKey="tasks"/, 'mobile tasks should surface unfinished follow-ups')
assert.match(activitySource, /MobileCreateRecoveryStrip moduleKey="activity"/, 'mobile activity should surface unfinished notes')
assert.match(homeSource, /MobileCreateRecoveryStrip limit=\{2\}/, 'mobile home should surface recent unfinished captures after return')

console.log('Phase 3 UX continuity checks passed')
