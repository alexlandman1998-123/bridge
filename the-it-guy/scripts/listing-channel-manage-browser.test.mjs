// Real dialog components and sale-status delivery service; loopback-only portal doubles.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium } from 'playwright'
import { transformSync } from 'esbuild'
import { validateListingPortalPublicUrl } from '../src/services/listings/listingMarketingChannelPresentation.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = path.resolve(root, '../output/listing-channel-manage-20261012')
await mkdir(out, { recursive: true })
const events = [], checks = [], errors = []
let failNext = ''
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import Dialog from '/src/components/listings/ListingChannelManageDialog.jsx';
import Relist from '/src/components/listings/ListingRelistDialog.jsx';
import Modal from '/src/components/ui/Modal.jsx';import Button from '/src/components/ui/Button.jsx';
import{saveListingChannelManagement}from'/src/services/listings/listingChannelManagement.js';
import '/src/index.css';
const send=async(channel,action,body={})=>{const r=await fetch('/fixture/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,action,...body})});const p=await r.json();if(!r.ok)throw new Error(p.error);return p};
function App(){const[channel,setChannel]=React.useState('');const[workflow,setWorkflow]=React.useState(null);const[error,setError]=React.useState('');const[busy,setBusy]=React.useState(false);const[status,setStatus]=React.useState('active');const[expiry,setExpiry]=React.useState('2026-11-30');const[links,setLinks]=React.useState({Property24:'https://www.property24.com/for-sale/example/116284','Private Property':'https://www.privateproperty.co.za/for-sale/example/T498201'});const[offline,setOffline]=React.useState({});const[accepted,setAccepted]=React.useState({});
const save=values=>saveListingChannelManagement({channel,draft:{listingStatus:status,listingType:'sale',property24ExpiryDate:expiry},activeChannels:['Property24','Private Property'],...values},{saveDraft:async d=>{await send('Arch9','save',{draft:d});setStatus(d.listingStatus);setExpiry(d.property24ExpiryDate);return{ok:true}},recordStarted:async()=>{},recordStage:async()=>{},recordFinished:async()=>{},sendUpdate:async t=>{await send(t.channel,t.action);setAccepted(v=>({...v,[t.channel]:true}))}});
const handoff=action=>{setWorkflow({channel,action});setChannel('');setError('')};
const remove=async()=>{setBusy(true);try{await send(workflow.channel,workflow.action);setOffline(v=>({...v,[workflow.channel]:true}));setWorkflow(null)}catch(e){setError(e.message)}finally{setBusy(false)}};
return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><h1 style={{fontSize:22}}>Listing channels</h1><p>Local acceptance fixture · simulated portals</p><div style={{display:'flex',gap:12,marginTop:20}}>{['Property24','Private Property'].map(c=><Button key={c} aria-label={'Manage '+c} onClick={()=>setChannel(c)}>Manage {c}</Button>)}</div>
{channel&&<Dialog channelName={channel} listingStatus={status} listing={{address:'24 Oak Avenue, Randburg',priceLabel:'R 2,450,000',reference:'A9-TEST-100001',statusLabel:status==='active'?'For sale':status.replace('_',' ')}} portal={{reference:channel==='Property24'?'116284':'T498201',publicUrl:links[channel],statusLabel:offline[channel]?'Withdrawn':'Live',checkedAt:'2026-10-12T19:40:00Z',publicationState:{stage:accepted[channel]?'accepted':'verified',submittedAt:'2026-10-12T19:39:00Z',publishedSnapshot:{},changes:[{key:'price',label:'Price',previousValue:'R 2,500,000',currentValue:'R 2,450,000'}]},issues:channel==='Private Property'&&!accepted[channel]?['The previous price update failed.']:[],warnings:channel==='Private Property'?['The original advert address is retained by Private Property.']:[],activity:[{id:'event',title:channel+' advert submitted',at:'2026-10-12T19:39:00Z',detail:'Existing advert reference retained.'}]}} expiryDate={expiry} minExpiryDate='2026-10-13' canUpdateExpiry={channel==='Property24'&&!offline[channel]} canUpdate={!offline[channel]} canRelist={status==='active'} canWithdraw={!offline[channel]} canExpire={channel==='Property24'&&!offline[channel]} onClose={()=>setChannel('')} onSave={save} onFix={()=>{setChannel('');history.pushState({},'','/editor');document.getElementById('fixture-editor').hidden=false}} onRefresh={()=>send(channel,'status')} onPreview={()=>send(channel,'preview')} onUpdate={async()=>{await send(channel,'update');setAccepted(v=>({...v,[channel]:true}));return{ok:true}}} onRetry={async()=>{await send(channel,'retry');setAccepted(v=>({...v,[channel]:true}));return{ok:true}}} onSavePublicUrl={async value=>{await send(channel,'save-link',{value});setLinks(v=>({...v,[channel]:value}));return{ok:true}}} onRelist={()=>handoff('relist')} onWithdraw={()=>handoff('withdraw')} onExpire={channel==='Property24'?()=>handoff('expire'):undefined} onVerify={()=>send(channel,'verify')}/>}<p id='fixture-editor' hidden>Listing details editor</p>
{workflow?.action==='relist'&&<Relist channels={[workflow.channel]} initialChannel={workflow.channel} expiryDate={expiry} minExpiryDate='2026-10-13' onClose={()=>setWorkflow(null)} onEdit={()=>{setWorkflow(null);document.getElementById('fixture-editor').hidden=false}} onRelist={async({channels})=>{for(const c of channels)await send(c,'relist');setOffline(v=>({...v,[workflow.channel]:false}));return channels.map(channel=>({channel,status:'completed',detail:'Portal confirms reactivation.'}))}}/>}
{workflow&&workflow.action!=='relist'&&<Modal open title={workflow.action==='expire'?'Expire listing':'Withdraw listing'} subtitle={workflow.channel} onClose={busy?undefined:()=>setWorkflow(null)} footer={<><Button variant='secondary' disabled={busy} onClick={()=>setWorkflow(null)}>Cancel</Button><Button disabled={busy} onClick={remove}>{workflow.action==='expire'?'Expire listing':'Withdraw listing'}</Button></>}><p>Remove this advert on {workflow.channel}? Other channels stay as they are.</p>{error&&<p role='alert'>{error}</p>}</Modal>}
</main>};createRoot(document.getElementById('root')).render(<App/>);`
transformSync(entry, { loader: 'jsx', jsx: 'transform' })
const server = await createServer({ root, configFile: false, envFile: false, cacheDir: path.join(out, 'node_modules/.vite'), plugins: [react(), {
  name: 'channel-manage-acceptance',
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url === '/fixture/action' || req.url === '/fixture/reset') {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk
        const body = JSON.parse(raw || '{}'); res.setHeader('Content-Type', 'application/json')
        if (req.url === '/fixture/reset') { failNext = body.failNext || ''; res.end(JSON.stringify({ ok: true })); return }
        events.push(body)
        if (failNext === body.action) { failNext = ''; res.statusCode = 503; res.end(JSON.stringify({ error: 'Portal temporarily unavailable. Saved listing retained.' })); return }
        if (body.action === 'save-link') validateListingPortalPublicUrl(body.channel === 'Property24' ? 'property24' : 'private_property', body.value)
        res.end(JSON.stringify({ ok: true, message: body.action==='status'?'Latest portal status checked.':body.action==='preview'?'Listing requirements passed.':body.action==='save-link'?'Live portal link saved.':undefined })); return
      } catch(error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); return }
    }
    if (req.url === '/fixture-entry.jsx') { res.setHeader('Content-Type','application/javascript'); const transformed = await server.transformRequest('/fixture-entry.jsx'); res.end(transformed.code); return }
    if (req.url === '/' || req.url.startsWith('/editor')) { res.setHeader('Content-Type','text/html'); res.end(await server.transformIndexHtml('/', '<!doctype html><html><head><title>Manage listing acceptance</title></head><body><div id="root"></div><script type="module" src="/fixture-entry.jsx"></script></body></html>')); return }
    next()
  }) },
  resolveId(id) { if (id === '/fixture-entry.jsx') return '\0fixture-entry.jsx' },
  load(id) { if (id === '\0fixture-entry.jsx') return transformSync(entry, { loader: 'jsx', jsx: 'transform' }).code },
}], optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'lucide-react', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'] }, server: { host: '127.0.0.1', port: 4252, strictPort: true }, define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' } })
let browser
try {
  await server.listen(); const origin='http://127.0.0.1:4252'
  browser=await chromium.launch({ headless:true })
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000)
  await page.goto(origin, {waitUntil:'domcontentloaded'}); const button=name=>page.getByRole('button',{name,exact:true}); const open=channel=>button('Manage '+channel).click(); const done=()=>button('Done').click()
  const requestCount=()=>events.length
  const record=name=>{checks.push({name,status:'passed'});console.log('PASS',name)}
  await open('Private Property');assert.equal(await page.getByRole('heading',{name:'Manage Private Property listing'}).count(),1)
  assert.equal(await button('Expire advert').count(),0);assert.equal(await button('Extend expiry').count(),0)
  await page.screenshot({path:path.join(out,'private-property-desktop.png'),fullPage:true});record('Direct portal popup; Private Property has no expiry controls')
  await page.getByRole('tab',{name:'Recent activity'}).click();assert.equal(await page.getByText('Private Property advert submitted').isVisible(),true);await page.getByRole('tab',{name:'Overview'}).click();record('Recent activity and overview tabs')
  const before=requestCount();await button('Update advert').click();await button('Cancel').click();assert.equal(requestCount(),before);record('Cancelled update sends nothing')
  await button('Check latest status').click();await page.getByText('Latest portal status checked.').waitFor();assert.equal(events.at(-1).channel,'Private Property');assert.equal(events.at(-1).action,'status');record('Fresh status targets selected portal')
  await button('Check requirements').click();await page.getByText('Listing requirements passed.').waitFor();assert.equal(events.at(-1).action,'preview');record('Requirements action')
  await page.getByText('Edit live portal link',{exact:true}).click();await page.getByLabel('Live portal link').fill('https://www.property24.com/for-sale/example/123');await button('Save link').click();await page.getByRole('alert').filter({hasText:'exact HTTPS Private Property'}).waitFor();assert.notEqual(events.at(-1).action,'save-link');record('Wrong-portal live link rejected without request')
  const savedLink='https://www.privateproperty.co.za/for-sale/example/T999';await page.getByLabel('Live portal link').fill(savedLink);await button('Save link').click();await page.getByText('Live portal link saved.').waitFor();assert.equal(await page.getByRole('link',{name:'View advert'}).getAttribute('href'),savedLink);record('Live link saved and View advert updated')
  await page.request.post(origin+'/fixture/reset',{data:{failNext:'update'}});await button('Update advert').click();await button('Send update').click();await page.getByRole('alert').filter({hasText:'Portal temporarily unavailable'}).waitFor();record('Failed update remains visible in popup')
  await button('Send update').click();await page.getByText('Update accepted. Check the public advert to confirm it.').waitFor();assert.equal(events.at(-1).channel,'Private Property');record('Update retry stays on the selected portal')
  await button('Confirm public advert is current').click();await button('Cancel').click();const beforeVerify=requestCount();await button('Confirm public advert is current').click();await button('Confirm verification').click();await page.getByText('Public advert verification saved.').waitFor();assert.equal(events.length,beforeVerify+1);assert.equal(events.at(-1).action,'verify');record('Public verification requires confirmation')
  await button('Relist / reactivate').click();assert.equal(await page.getByRole('checkbox',{name:'Private Property',exact:true}).isChecked(),true);assert.equal(await page.getByRole('checkbox',{name:'Property24',exact:true}).count(),0);await page.getByRole('checkbox',{name:'This is the same property as the original advert.'}).check();await button('Relist selected channels').click();await page.getByText('Portal confirms reactivation.').waitFor();assert.equal(events.at(-1).channel,'Private Property');await button('Done').click();record('Relist confirms identity and keeps selected portal')
  await open('Private Property');await button('Withdraw advert').click();const beforeCancel=requestCount();await button('Cancel').click();assert.equal(requestCount(),beforeCancel);await open('Private Property');await button('Withdraw advert').click();await button('Withdraw listing').click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(events.at(-1).channel,'Private Property');assert.equal(events.at(-1).action,'withdraw');record('Withdrawal confirmation and cancellation')
  await open('Property24');await button('Extend expiry').click();await page.getByLabel('Listing expiry date').fill('2026-10-01');assert.equal(await button('Save changes').isDisabled(),true);await page.getByLabel('Listing expiry date').fill('2026-12-31');await button('Save changes').click();await page.getByText('Property24 expiry update accepted. Check the advert to confirm it.').waitFor();assert.equal(events.at(-1).channel,'Property24');assert.equal(events.at(-1).action,'expiry');record('Expiry validation and selected-portal save')
  await button('Expire advert').click();await button('Expire listing').click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(events.at(-1).action,'expire');record('Expire advert confirmation')
  await page.goto(origin, {waitUntil:'domcontentloaded'});await open('Property24');await button('Change listing status').click();await page.getByLabel('Listing status').selectOption('under_offer');await button('Save changes').click();await page.getByText('Listing status saved. Channel results are shown below.').waitFor();assert.deepEqual(events.slice(-2).map(e=>e.channel),['Property24','Private Property']);record('Under offer sends whole-listing status to active channels')
  await button('Change listing status').click();await page.getByLabel('Listing status').selectOption('sold');await button('Save changes').click();await page.getByText('Listing status saved. Channel results are shown below.').waitFor();assert.equal(await button('Change listing status').isDisabled(),true);record('Sold sends status and disables further sale changes')
  await done();await open('Property24');await button('Edit listing details').click();await page.getByText('Listing details editor').waitFor();record('Edit opens listing editor')
  await page.goto(origin, {waitUntil:'domcontentloaded'});await page.setViewportSize({width:390,height:844});await open('Private Property');await page.screenshot({path:path.join(out,'private-property-mobile.png'),fullPage:true});const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false);record('Mobile popup has no horizontal overflow')
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});record('Escape closes the popup')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({checks:checks.length,requests:events.length,externalRequests:'blocked',screenshots:out}))
} finally {
  await writeFile(path.join(out,'browser-results.json'),JSON.stringify({checks,events,errors},null,2))
  await browser?.close();await server.close()
}
