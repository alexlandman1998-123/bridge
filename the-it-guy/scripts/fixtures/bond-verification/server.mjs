import { jsPDF } from 'jspdf'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('../../../', import.meta.url))
export async function startBondVerificationServer() {
  const server = await createServer({ configFile: false, envDir: false, root, publicDir: false, cacheDir: resolve(root, 'node_modules/.vite-bond-verification'), optimizeDeps: { entries: ['scripts/fixtures/bond-verification/app.jsx'], include: ['jspdf','fflate','react','react-dom/client','react-router-dom','lucide-react','clsx','tailwind-merge'] }, plugins: [{ name: 'offline-bond-fixtures', enforce: 'pre', resolveId(source, importer) {
    if (/(^|\/)lib\/api(?:\.js)?$/.test(source) || (source === './api' && importer?.endsWith('/src/lib/clientPortalApi.js'))) return resolve(root, 'scripts/fixtures/bond-verification/api.js')
  }, configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] === '/') { res.setHeader('Content-Type','text/html'); res.end(await server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bond verification (offline)</title></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/bond-verification/app.jsx"></script></body></html>')); return }
      if (req.url === '/verification-file.pdf') { res.setHeader('Content-Type','application/pdf'); const pdf = new jsPDF(); pdf.text('SYNTHETIC VERIFICATION FIXTURE - NOT A SIGNED APPLICATION', 12, 20); res.end(Buffer.from(pdf.output('arraybuffer'))); return }
      next()
    })
  } }, react()], server: { host: '127.0.0.1', port: 4179, strictPort: true } })
  await server.listen()
  return server
}
if (process.argv.includes('--serve')) { await startBondVerificationServer(); console.log('Offline bond verification: http://127.0.0.1:4179') }
