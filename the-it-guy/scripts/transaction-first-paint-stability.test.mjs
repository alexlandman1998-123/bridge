import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

assert.match(source, /const hasUnverifiedRouteData = Boolean\(data\?\.__isNavigationPreview \|\| data\?\.__isRouteShell\)/, 'Route previews and shells must be treated as unverified.')
assert.match(source, /const isStaleTransactionData = Boolean\(dataTransactionId && routeTransactionId && dataTransactionId !== routeTransactionId\)/, 'A previous transaction must not render for a new route.')
assert.match(source, /if \(hasUnverifiedRouteData \|\| isStaleTransactionData\) \{\s*return <TransactionDetailRouteShell \/>/s, 'The loading shell must stay visible until route-core data matches the requested transaction.')
const renderGate = source.slice(source.indexOf('const hasUnverifiedRouteData ='), source.indexOf("if (!data || !transaction)"))
assert.ok(renderGate.indexOf('if (hasUnverifiedRouteData || isStaleTransactionData)') < renderGate.indexOf('if (loading) {'), 'The first-paint guard must run before the generic loading guard.')

console.log('transaction first-paint stability checks passed')
