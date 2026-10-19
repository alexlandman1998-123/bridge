import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import config from '../../tailwind.config.js'
import { actor, agentA, transactionSellerFixture } from './seller-alignment-database.mjs'
const db = await transactionSellerFixture({ linked: false })
await actor(db, 'postgres')
await db.exec('alter table transaction_participants add column transaction_role text, add column legal_role text, add column status text;')
await db.exec(await readFile(new URL('../../../supabase/migrations/20261019192602_transaction_seller_manual_capture.sql', import.meta.url), 'utf8'))
// Start from contacts only: no listing, lead or onboarding submission.
await db.exec("begin; select seller_save_private.authorise('00000000-0000-4000-8000-000000000801'); update transactions set seller_name='Jamie Seller',seller_email=null,seller_phone=null; delete from transaction_participants; delete from onboarding_form_data; commit;")
await actor(db, 'authenticated', agentA)
const transport = `export const supabase={rpc:async(name,params)=>{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,params})});return response.json()}};export const isSupabaseConfigured=true;`
const built = await build({ entryPoints: [new URL('./transaction-seller-capture-browser.jsx', import.meta.url).pathname], bundle: true, write: false, outfile: 'seller-capture-preview.js', format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'isolated-transaction-seller', setup(bundle) {
  bundle.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'isolated' }))
  bundle.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: transport, loader: 'js' }))
} }] })
const css = (await postcss([tailwind({ ...config, content: [...config.content, './scripts/fixtures/transaction-seller-capture-browser.jsx'] }), autoprefixer()]).process(await readFile(new URL('../../src/index.css', import.meta.url), 'utf8'), { from: new URL('../../src/index.css', import.meta.url).pathname })).css
let queue = Promise.resolve()
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/runtime.js') { response.setHeader('content-type','text/javascript'); response.end(built.outputFiles.find(file=>file.path.endsWith('.js')).text); return }
    if (request.url === '/style.css') { response.setHeader('content-type','text/css'); response.end(css+(built.outputFiles.find(file=>file.path.endsWith('.css'))?.text || '')+'body{background:#f6f8fb}:root{--color-primary:#286548;--color-primary-hover:#204f39}'); return }
    if (request.url === '/rpc') {
      let raw = ''; for await (const chunk of request) raw += chunk
      const { name, params } = JSON.parse(raw)
      const operation = async () => {
        try {
          let result
          if (name === 'bridge_get_transaction_seller_capture') result = await db.query('select public.bridge_get_transaction_seller_capture($1) result',[params.p_transaction_id])
          else if (name === 'bridge_save_transaction_seller_capture') result = await db.query('select public.bridge_save_transaction_seller_capture($1,$2::jsonb,$3::jsonb,$4) result',[params.p_transaction_id,JSON.stringify(params.p_revision),JSON.stringify(params.p_profile),params.p_mutation_id])
          else throw new Error('Unexpected fixture RPC')
          return { data: result.rows[0].result, error: null }
        } catch (error) { return { data:null, error:{ message:error.message, code:error.code } } }
      }
      const pending = queue.then(operation); queue = pending.catch(()=>null)
      response.setHeader('content-type','application/json'); response.end(JSON.stringify(await pending)); return
    }
    response.setHeader('content-type','text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seller capture preview</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/runtime.js"></script></body></html>')
  } catch (error) { response.statusCode=500; response.end(error.message) }
})
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,isolation:'synthetic PostgreSQL; no hosted writes or delivery'})))
process.on('SIGTERM',async()=>{server.close();await db.close();process.exit(0)})
