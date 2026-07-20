import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getLegalDocumentEditorGridClass,
  getLegalDocumentEditorLayoutState,
  LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES,
  resolveLegalDocumentEditorLayoutMode,
} from '../legalDocumentEditorLayout.js'

test('resolves focused editor modes without changing the generic builder', () => {
  assert.equal(resolveLegalDocumentEditorLayoutMode({ focused: false, scope: 'standard' }), 'generic')
  assert.equal(resolveLegalDocumentEditorLayoutMode({ focused: true, scope: 'standard' }), 'standard')
  assert.equal(resolveLegalDocumentEditorLayoutMode({ focused: true, scope: 'situations' }), 'situations')
  assert.equal(resolveLegalDocumentEditorLayoutMode({ focused: true, scope: 'signing' }), 'signing')
})

test('keeps standard tools out of the layout until requested', () => {
  const collapsed = getLegalDocumentEditorLayoutState({
    mode: LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.standard,
    toolsCollapsed: true,
  })
  const expanded = getLegalDocumentEditorLayoutState({
    mode: LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.standard,
    toolsCollapsed: false,
  })

  assert.equal(collapsed.hideTools, true)
  assert.equal(expanded.hideTools, false)
  assert.match(getLegalDocumentEditorGridClass({ mode: 'standard', toolsCollapsed: true }), /grid-cols-\[240px_minmax\(0,1fr\)\]/)
  assert.match(getLegalDocumentEditorGridClass({ mode: 'standard', toolsCollapsed: false }), /320px/)
})

test('uses one focused clause column and a two-column signing workspace', () => {
  const situations = getLegalDocumentEditorLayoutState({ mode: 'situations' })
  const signing = getLegalDocumentEditorLayoutState({ mode: 'signing' })

  assert.deepEqual(
    { hideOutline: situations.hideOutline, hideMain: situations.hideMain, hideTools: situations.hideTools },
    { hideOutline: true, hideMain: false, hideTools: true },
  )
  assert.deepEqual(
    { hideOutline: signing.hideOutline, hideMain: signing.hideMain, hideTools: signing.hideTools, fullWidth: signing.toolsUseFullWidth },
    { hideOutline: false, hideMain: true, hideTools: false, fullWidth: true },
  )
  assert.match(getLegalDocumentEditorGridClass({ mode: 'situations' }), /grid-cols-1/)
  assert.match(getLegalDocumentEditorGridClass({ mode: 'signing' }), /240px_minmax\(0,1fr\)/)
})

test('retains collapsible rails only in the generic builder', () => {
  const generic = getLegalDocumentEditorLayoutState({ mode: 'generic', outlineCollapsed: true, toolsCollapsed: true })
  const focused = getLegalDocumentEditorLayoutState({ mode: 'standard', outlineCollapsed: true, toolsCollapsed: true })

  assert.equal(generic.outlineCollapsed, true)
  assert.equal(generic.toolsAreCollapsedRail, true)
  assert.equal(focused.outlineCollapsed, false)
  assert.equal(focused.toolsAreCollapsedRail, false)
})
