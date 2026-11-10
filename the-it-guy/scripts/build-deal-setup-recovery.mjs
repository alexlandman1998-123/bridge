import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// Vite resolves extensionless imports in the existing document engine. Bundle
// just these shared services for native Node rather than importing browser code
// or compiling source on every scheduled invocation.
export async function buildDealSetupRecovery(outfile = fileURLToPath(new URL('../dist-ssr/dealSetupReconciler.mjs', import.meta.url))) {
  await build({
    stdin: {
      contents: "export { syncDealSetupAttorneyHandoff, syncDealSetupDownstream } from './src/services/dealSetupService.js'",
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
      sourcefile: 'dealSetupReconciler.js',
    },
    outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'server-only-injected-client',
      setup(builder) {
        builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'injected-client', namespace: 'recovery' }))
        builder.onLoad({ filter: /.*/, namespace: 'recovery' }, () => ({ contents: 'export const supabase = null; export const isSupabaseConfigured = false;' }))
      },
    }],
    logLevel: 'silent',
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildDealSetupRecovery()
