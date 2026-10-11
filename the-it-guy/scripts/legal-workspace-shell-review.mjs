// Exact additive shell edits reviewed for Phase 3. Removing them must reconstruct
// the Phase 1 source byte-for-byte; arbitrary changes are never accepted here.
export function withoutLegalShell(path, source) {
  // The reviewed production catch-up defers the DEV-only client preview so it
  // cannot pull client screens into the login bundle. Reconstruct its exact
  // former spelling for the unchanged baseline; every other edit still fails.
  if (path === 'the-it-guy/src/App.jsx') {
    const deferred = "const LocalClientTransactionPreviewPage = import.meta.env.DEV\n  ? lazy(() => import('./components/clients/ClientTransactionsPanel').then(module => ({ default: module.LocalClientTransactionPreviewPage })))\n  : null\n";
    if (source.includes(deferred)) {
      if (source.indexOf(deferred) !== source.lastIndexOf(deferred)) return null;
      const route = '  if (localPreview) return <Suspense fallback={<TransactionDetailRouteShell />}><LocalClientTransactionPreviewPage preview={localPreview} /></Suspense>\n';
      if (!source.includes(route) || source.indexOf(route) !== source.lastIndexOf(route)) return null;
      source = source.replace(deferred, '')
        .replace("import AppErrorBoundary from './components/AppErrorBoundary'\n", "import AppErrorBoundary from './components/AppErrorBoundary'\nimport { LocalClientTransactionPreviewPage } from './components/clients/ClientTransactionsPanel'\n")
        .replace(route, '  if (localPreview) return <LocalClientTransactionPreviewPage preview={localPreview} />\n');
    }
  }
  const replacements = path==='the-it-guy/src/App.jsx' ? [
    ["// Arch9 Legal shell integration (additive, disabled by default).\nimport LegalWorkspaceProvider from './modules/legal/LegalWorkspaceProvider'\nconst LegalWorkspacePage = lazy(() => import('./modules/legal/LegalWorkspacePage'))\n",''],
    ['        <LegalWorkspaceProvider>\n',''],
    ['        </LegalWorkspaceProvider>\n',''],
    ["              {/* Arch9 Legal routes: existing attorney routes stay unchanged. */}\n              <Route path=\"/legal/overview\" element={<RoleRoute allowedRoles={['attorney']}><LegalWorkspacePage /></RoleRoute>} />\n              <Route path=\"/legal/matters\" element={<RoleRoute allowedRoles={['attorney']}><LegalWorkspacePage /></RoleRoute>} />\n              <Route path=\"/legal/new\" element={<RoleRoute allowedRoles={['attorney']}><LegalWorkspacePage /></RoleRoute>} />\n              <Route path=\"/legal/matters/:matterId\" element={<RoleRoute allowedRoles={['attorney']}><LegalWorkspacePage /></RoleRoute>} />\n",''],
  ] : path==='the-it-guy/src/components/Sidebar.jsx' ? [
    ["// Arch9 Legal navigation integration.\nimport LegalWorkspaceSwitcher from '../modules/legal/LegalWorkspaceSwitcher'\nimport LegalNavigation from '../modules/legal/LegalNavigation'\nimport { useLegalWorkspace } from '../modules/legal/LegalWorkspaceContext'\n\n",''],
    ['  const legalWorkspace = useLegalWorkspace()\n',''],
    ["onChange={(workspaceId) => {\n              if (!legalWorkspace?.available || !location.pathname.startsWith('/legal') || legalWorkspace.confirmLeave()) return workspaceContext.setWorkspace({ id: workspaceId })\n            }}",'onChange={(workspaceId) => workspaceContext.setWorkspace({ id: workspaceId })}'],
    ['          <LegalWorkspaceSwitcher />\n',''],
    ["{role === 'attorney' && location.pathname.startsWith('/legal') ? <LegalNavigation /> : role === 'bond_originator' ? (", "{role === 'bond_originator' ? ("],
    ["{firmNavItems.length && !location.pathname.startsWith('/legal') ? <div",'{firmNavItems.length ? <div'],
    ["{firmNavItems.length && !location.pathname.startsWith('/legal') ? (\n        <nav",'{firmNavItems.length ? (\n        <nav'],
  ] : null;
  if(!replacements)return null;
  for(const [addition,original] of replacements) {
    if(!source.includes(addition)||source.indexOf(addition)!==source.lastIndexOf(addition))return null;
    source=source.replace(addition,original);
  }
  return source;
}
