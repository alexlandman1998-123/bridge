export const LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES = Object.freeze({
  generic: 'generic',
  standard: 'standard',
  situations: 'situations',
  signing: 'signing',
})

export function resolveLegalDocumentEditorLayoutMode({ focused = false, scope = 'all' } = {}) {
  if (!focused) return LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic
  if (scope === 'standard') return LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.standard
  if (scope === 'situations') return LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.situations
  if (scope === 'signing') return LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.signing
  return LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic
}

export function getLegalDocumentEditorGridClass({
  mode = LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic,
  outlineCollapsed = false,
  toolsCollapsed = true,
} = {}) {
  if (mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.situations) {
    return 'mx-auto w-full max-w-5xl xl:grid-cols-1'
  }
  if (mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.signing) {
    return 'mx-auto w-full max-w-6xl xl:grid-cols-[240px_minmax(0,1fr)]'
  }
  if (mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.standard) {
    return toolsCollapsed
      ? 'mx-auto w-full max-w-7xl xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]'
      : 'mx-auto w-full max-w-[1480px] xl:grid-cols-[220px_minmax(0,1fr)_minmax(280px,320px)] 2xl:grid-cols-[250px_minmax(0,1fr)_320px]'
  }
  if (outlineCollapsed) {
    return toolsCollapsed
      ? 'xl:grid-cols-[64px_minmax(0,1fr)_64px]'
      : 'xl:grid-cols-[64px_minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[64px_minmax(0,1fr)_minmax(280px,320px)]'
  }
  return toolsCollapsed
    ? 'xl:grid-cols-[220px_minmax(0,1fr)_64px] 2xl:grid-cols-[260px_minmax(0,1fr)_64px]'
    : 'xl:grid-cols-[220px_minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[260px_minmax(0,1fr)_minmax(280px,320px)]'
}

export function getLegalDocumentEditorLayoutState({
  mode = LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic,
  outlineCollapsed = false,
  toolsCollapsed = true,
} = {}) {
  const focused = mode !== LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic
  return {
    focused,
    outlineCollapsed: !focused && outlineCollapsed,
    hideOutline: mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.situations,
    hideMain: mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.signing,
    hideTools: mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.situations
      || (mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.standard && toolsCollapsed),
    toolsAreCollapsedRail: mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.generic && toolsCollapsed,
    toolsUseFullWidth: mode === LEGAL_DOCUMENT_EDITOR_LAYOUT_MODES.signing,
  }
}
