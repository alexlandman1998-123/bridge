// Local, in-memory PostgreSQL preview: never connects to a remote database.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createExternalWebsiteDatabase, databaseClient } from './fixtures/externalWebsiteDatabase.js'
const db = await createExternalWebsiteDatabase()
const client = databaseClient(db)
const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.test'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_local_fixture') },
  plugins: [react(), { name: 'local-external-websites-rpc', configureServer(server) {
    server.middlewares.use('/__external-websites-test/rpc', async (request,response) => {
      response.setHeader('Content-Type','application/json')
      try { const chunks=[];for await(const chunk of request)chunks.push(chunk);const params=JSON.parse(Buffer.concat(chunks).toString('utf8'));const result=await client.rpc('external_website_manage',params);response.end(JSON.stringify({data:result.data,error:result.error?{message:result.error.message}:null})) }
      catch { response.statusCode=400;response.end(JSON.stringify({error:{message:'Invalid local preview request'}})) }
    })
  } }], server: { host: '127.0.0.1', port: 4189, strictPort: true } })
await server.listen()
console.log('Local database preview: http://127.0.0.1:4189/server/tests/fixtures/external-websites-preview.html')
const close = async () => { await server.close();await db.close();process.exit(0) }
process.on('SIGINT',close);process.on('SIGTERM',close)
