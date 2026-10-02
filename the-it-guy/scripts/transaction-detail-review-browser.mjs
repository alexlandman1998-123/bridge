// Synthetic, local-only UI → service → migrated PostgreSQL verification.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTransactionDetailReviewFixture } from "./lib/transactionDetailReviewFixture.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { db, tx, user, pdf, future } =
  await createTransactionDetailReviewFixture();
await db.exec(
  `create table buyer_profile_documents(buyer_id uuid,document_key text,is_active boolean);grant select on transactions,transaction_participants,buyers,buyer_profile_documents to authenticated;create function fixture_replace_source() returns void language sql security definer as $$update storage.objects set updated_at=updated_at+interval '1 second' where name='otp.pdf'$$;`,
);
await db.query("select set_config('test.user',$1,false)", [user]);
await db.exec("set role authenticated");
const client = `const req=async(p,b)=>fetch('/fixture/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());class Q{constructor(t){this.table=t;this.filters=[]}select(){return this}eq(k,v){this.filters.push([k,v]);return this}is(k,v){return this.eq(k,v)}in(k,v){return this.eq(k,v)}order(){return this}limit(){return this}single(){this.one=true;return this}maybeSingle(){return this.single()}then(a,b){return req('query',this).then(a,b)}}export const supabase={from:t=>new Q(t),rpc:(name,args)=>req('rpc',{name,args}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:location.origin+'/fixture/source.pdf'},error:null})})}};export const isSupabaseConfigured=true;export const DOCUMENTS_BUCKET='documents',DOCUMENTS_BUCKET_CANDIDATES=['documents'],LEGAL_TEMPLATES_BUCKET='legal-templates',LEGAL_TEMPLATES_BUCKET_CANDIDATES=['legal-templates'],BRANDING_BUCKET='organisation-branding',BRANDING_BUCKET_CANDIDATES=['organisation-branding'],PROFILE_AVATAR_BUCKET='profile-avatars',PROFILE_AVATAR_BUCKET_CANDIDATES=['profile-avatars'];export const createScopedSupabaseClient=()=>supabase;export const invokeEdgeFunction=async()=>{throw new Error('Not used in this verification fixture')};export const getEdgeFunctionInvokeError=r=>r?.error;export const assertEdgeFunctionSuccess=r=>{if(r.error)throw r.error;return r.data};export default supabase;`;
const entry = `import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import DealSetup from '/src/components/transaction/DealSetupPanel.jsx';import Table from '/src/components/AgentTransactionsTable.jsx';import{supabase}from'/src/lib/supabaseClient.js';import '/src/index.css';function App(){const[id,setId]=useState('');const[rows,setRows]=useState([]);const reload=async()=>{const r=await supabase.from('transactions').select();setRows(r.data.map(t=>({transaction:t,buyer:{name:t.id==='${tx}'?'Scanned name':t.id==='${future}'?'Missing source deal':'Other fixture deal'},stage:t.stage||'Available'})))};useEffect(()=>{reload()},[]);return <main className="mx-auto max-w-[1600px] space-y-5 p-6"><h1 className="text-2xl font-semibold">Imported deal review · local verification</h1><p>Synthetic data. Historical sale date: 2024-04-03.</p>{id?<><button onClick={()=>{setId('');reload()}}>Return to transactions</button><DealSetup transactionId={id} canEdit onSaved={reload}/></>:<Table rows={rows} onRowClick={r=>setId(r.transaction.id)}/>}</main>}createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`;
const body = async (req) => {
  let s = "";
  for await (const chunk of req) s += chunk;
  return JSON.parse(s || "{}");
};
const send = (res, value) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
};
const rpc = {
  bridge_get_transaction_detail_review: ["p_transaction_id"],
  bridge_get_imported_transaction_review_status: ["p_transaction_ids"],
  bridge_save_transaction_detail_review: [
    "p_transaction_id",
    "p_section",
    "p_details",
    "p_expected_snapshot",
    "p_expected_revision",
    "p_confirm",
    "p_source_document_id",
  ],
};
const server = await createServer({
  root,
  configFile: false,
  plugins: [
    react(),
    {
      name: "isolated-review-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "/fixture/entry.jsx")
          return path.join(root, "fixture-entry.jsx");
      },
      load(id) {
        if (id.endsWith("/src/lib/supabaseClient.js")) return client;
        if (id.endsWith("/fixture-entry.jsx")) return entry;
      },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            if (req.url === "/") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await server.transformIndexHtml(
                  "/",
                  `<html><head><title>Imported review verification</title></head><body><div id="root"></div><script type="module" src="/fixture/entry.jsx"></script></body></html>`,
                ),
              );
              return;
            }

            if (req.url === "/fixture/source.pdf") {
              res.setHeader("Content-Type", "application/pdf");
              res.end(
                "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 600 800]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 132>>stream\nBT /F1 16 Tf 50 730 Td (Synthetic OTP for local verification) Tj 0 -30 Td (Buyer: Correct name. Seller: Seller.) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
              );
              return;
            }
            if (req.url === "/fixture/rpc") {
              const { name, args } = await body(req),
                fields = rpc[name];
              if (!fields) throw new Error("Unknown fixture RPC");
              const values = fields.map((k) =>
                args[k] !== null &&
                typeof args[k] === "object" &&
                !Array.isArray(args[k])
                  ? JSON.stringify(args[k])
                  : args[k],
              );
              const r = await db.query(
                "select public." +
                  name +
                  "(" +
                  fields.map((_, i) => "$" + (i + 1)).join(",") +
                  ") r",
                values,
              );
              send(res, { data: r.rows[0].r, error: null });
              return;
            }
            if (req.url === "/fixture/query") {
              const { table, filters = [], one = false } = await body(req);
              if (
                ![
                  "transactions",
                  "buyers",
                  "transaction_participants",
                  "buyer_profile_documents",
                ].includes(table)
              )
                throw new Error("Unsupported fixture table");
              const values = [];
              const where = filters
                .map(([k, v]) => {
                  if (
                    ![
                      "id",
                      "transaction_id",
                      "transaction_role",
                      "removed_at",
                      "is_active",
                      "buyer_id",
                    ].includes(k)
                  )
                    throw new Error("Unsupported fixture filter");
                  if (v === null) return k + " is null";
                  values.push(v);
                  return (
                    k +
                    (Array.isArray(v) ? "=any(" : "=") +
                    "$" +
                    values.length +
                    (Array.isArray(v) ? ")" : "")
                  );
                })
                .join(" and ");
              const r = await db.query(
                "select * from public." +
                  table +
                  (where ? " where " + where : ""),
                values,
              );
              send(res, {
                data: one ? r.rows[0] || null : r.rows,
                error: null,
              });
              return;
            }
            if (
              req.url === "/fixture/replace-source" &&
              req.method === "POST"
            ) {
              await db.query("select fixture_replace_source()");
              send(res, { ok: true });
              return;
            }
            if (req.url === "/fixture/checks") {
              const r = await db.query(
                "select buyer_name,assigned_attorney_email,sale_date::text,stage from transactions where id=$1",
                [tx],
              );
              send(res, {
                ...r.rows[0],
                transactionId: tx,
                sourceDocumentId: pdf,
              });
              return;
            }
            next();
          } catch (e) {
            send(res, {
              data: null,
              error: { code: e.code || "FIXTURE_ERROR", message: e.message },
            });
          }
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 4189, strictPort: true },
});
await server.listen();
console.log("Synthetic review harness ready at http://127.0.0.1:4189");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    await db.close();
    process.exit(0);
  });
