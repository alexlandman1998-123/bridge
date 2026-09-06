import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const modal = source('../src/components/ui/Modal.jsx')
const workbench = source('../src/components/attorney/workflow/LegalTaskWorkbench.jsx')
const lanes = source('../src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx')

// Shared attorney dialogs must be operable without a pointer and return users to context.
assert.match(modal, /event\.key === 'Escape'/, 'dialogs must close with Escape')
assert.match(modal, /event\.key !== 'Tab'/, 'dialogs must contain keyboard focus')
assert.match(modal, /previouslyFocused\.focus\(\)/, 'dialogs must restore focus')
assert.match(modal, /document\.body\.style\.overflow = 'hidden'/, 'dialogs must lock background scrolling')
assert.match(modal, /aria-labelledby=/, 'dialogs must expose their visible title')
assert.match(modal, /aria-describedby=/, 'dialogs must expose supporting context')

// The task surface must explain blockers visibly instead of relying on hover text.
assert.match(workbench, /Before you can complete this task:/)
assert.match(workbench, /aria-describedby=\{primaryAction\.disabled \? completionHelpId/)
assert.match(workbench, /aria-describedby=\{!model\.canComplete \? completionHelpId/)
assert.doesNotMatch(workbench, /title=\{!model\.canComplete/)
assert.match(workbench, /aria-busy=\{saving\}/)
assert.match(workbench, /autoFocus/)
assert.match(workbench, /min-h-1[012]/, 'workflow controls must retain touch-friendly heights')
assert.match(workbench, /xl:grid-cols-/, 'workbench must retain a responsive desktop layout')

// Every mutation clears stale success copy; failed submissions retain their draft modal.
const mutationStarts = lanes.match(/setNotice\(''\)\s+setSaving\(true\)/g) || []
assert.equal(mutationStarts.length, 8, 'every attorney lane mutation must clear stale success feedback')
assert.match(lanes, /role="alert"/)
assert.match(lanes, /role="status" aria-live="polite"/)
assert.match(lanes, /catch \(error\)[\s\S]*?Unable to save attorney update[\s\S]*?finally/, 'save failures must be surfaced')
assert.doesNotMatch(lanes, /catch \(error\) \{\s*setNoteDraft\(null\)/, 'a failed update must preserve its draft')

console.log('Attorney release Phase 4 UI gate passed: modal keyboard safety, visible blockers, responsive controls, draft recovery, and save feedback verified.')
