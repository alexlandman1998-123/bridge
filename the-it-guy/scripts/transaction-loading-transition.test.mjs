import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const page = read('../src/pages/AttorneyTransactionDetail.jsx')
const app = read('../src/App.jsx')
const list = read('../src/pages/AttorneyMattersPage.jsx')
const loader = read('../src/routes/transactionDetailRouteLoader.js')
assert.match(app, /lazy\(loadTransactionDetailRouteModule\)/)
assert.match(app, /Suspense fallback=\{<TransactionDetailRouteShell \/>\}/)
assert.match(page, /if \(shouldRenderAttorneyAccessPreview\) \{\s*return <TransactionDetailRouteShell \/>/)
assert.match(page, /if \(loading\) \{\s*return <TransactionDetailRouteShell \/>/)
assert.ok(page.includes("if (workspaceRole === 'attorney' && !matterAccessAllowed)"))
assert.ok(page.indexOf("if (workspaceRole === 'attorney' && !matterAccessAllowed)") < page.indexOf('if (loading) {', page.indexOf('const shouldRenderAttorneyAccessPreview')))
for (const event of ['onMouseEnter', 'onFocus', 'onTouchStart']) assert.ok(list.includes(`${event}={preloadTransactionDetailRoute}`))
assert.ok(loader.includes('modulePromise = undefined'), 'Failed prefetch must allow retry')
assert.ok(!loader.includes('supabase'), 'Prefetch must not query protected data')
const shell = read('../src/components/transactions/TransactionDetailRouteShell.jsx')
const { code } = await transform(shell.replace('export default function', 'function'), { loader: 'jsx', jsxFactory: 'React.createElement' })
const Component = new Function('React', `${code}; return TransactionDetailRouteShell`)(React)
const html = renderToStaticMarkup(React.createElement(Component))
assert.ok(html.includes('aria-busy="true"'))
assert.ok(html.includes('Opening matter workspace'))
assert.ok(!html.includes('matterPreview'), 'Loading shell must not expose navigation preview data')
for (const source of [page, app, list]) await transform(source, { loader: 'jsx' })
console.log('PASS: consistent loading shell, access gates retained, code-only prefetch, retry path, accessible SSR and JSX compilation.')
