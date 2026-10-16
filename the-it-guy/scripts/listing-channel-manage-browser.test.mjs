// Real dialog components and sale-status delivery service; loopback-only portal doubles.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindConfig from '../tailwind.config.js'
import { chromium } from 'playwright'
import { transformSync } from 'esbuild'
import { validateListingPortalPublicUrl } from '../src/services/listings/listingMarketingChannelPresentation.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = path.resolve(root, process.env.LISTING_CHANNEL_CHECK_OUTPUT || '../output/playwright/listing-expiry-20261013')
await mkdir(out, { recursive: true })
const events = [], checks = [], errors = []
let failNext = ''
const entry = `
import React from 'react';import{createRoot}from'react-dom/client';
import Dialog from '/src/components/listings/ListingChannelManageDialog.jsx';
import Relist from '/src/components/listings/ListingRelistDialog.jsx';
import Modal from '/src/components/ui/Modal.jsx';import Button from '/src/components/ui/Button.jsx';
import{saveListingChannelManagement}from'/src/services/listings/listingChannelManagement.js';
import{getWebsiteListingReadiness}from'/src/services/listings/listingMarketingChannelPresentation.js';
import '/src/index.css';
const streamlined=new URLSearchParams(window.location.search).has('simple-update');
const send=async(channel,action,body={})=>{const r=await fetch('/fixture/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,action,...body})});const p=await r.json();if(!r.ok)throw new Error(p.error);return p};
function App(){const[channel,setChannel]=React.useState('');const[workflow,setWorkflow]=React.useState(null);const[error,setError]=React.useState('');const[busy,setBusy]=React.useState(false);const[status,setStatus]=React.useState('active');const[expiry,setExpiry]=React.useState('2026-11-30');const[links,setLinks]=React.useState({Property24:'https://www.property24.com/for-sale/example/116284','Private Property':'https://www.privateproperty.co.za/for-sale/example/T498201'});const[offline,setOffline]=React.useState({});const[accepted,setAccepted]=React.useState({});
const[websitePublished,setWebsitePublished]=React.useState(false);
const websiteReadiness=getWebsiteListingReadiness(['Publish the listing projection before enabling the agency-website channel.','Prepare durable website copies for every listing image.']);
const save=values=>saveListingChannelManagement({channel,draft:{listingStatus:status,listingType:'sale',property24ExpiryDate:expiry},activeChannels:['Property24','Private Property'],...values},{saveDraft:async d=>{await send('Arch9','save',{draft:d});setStatus(d.listingStatus);setExpiry(d.property24ExpiryDate);return{ok:true}},recordStarted:async()=>{},recordStage:async()=>{},recordFinished:async()=>{},sendUpdate:async t=>{await send(t.channel,t.action);setAccepted(v=>({...v,[t.channel]:true}))}});
const handoff=action=>{setWorkflow({channel,action});setChannel('');setError('')};
const remove=async()=>{setBusy(true);try{await send(workflow.channel,workflow.action);setOffline(v=>({...v,[workflow.channel]:true}));setWorkflow(null)}catch(e){setError(e.message)}finally{setBusy(false)}};
return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><h1 style={{fontSize:22}}>Listing channels</h1><p>Local acceptance fixture · simulated portals</p><div style={{display:'flex',gap:12,marginTop:20}}>{['Property24','Private Property','Agency Website'].map(c=><Button key={c} aria-label={'Manage '+c} onClick={()=>setChannel(c)}>Manage {c}</Button>)}</div>
{channel&&channel!=='Agency Website'&&<Dialog channelName={channel} streamlinedUpdate={streamlined&&channel==='Private Property'} listingStatus={status} listing={{address:'24 Oak Avenue, Randburg',priceLabel:'R 2,450,000',reference:'A9-TEST-100001',statusLabel:status==='active'?'For sale':status.replace('_',' ')}} portal={{reference:channel==='Property24'?'116284':'T498201',publicUrl:links[channel],statusLabel:offline[channel]?'Withdrawn':'Live',checkedAt:'2026-10-12T19:40:00Z',publicationState:{stage:accepted[channel]?'accepted':'verified',submittedAt:'2026-10-12T19:39:00Z',publishedSnapshot:{},changes:[{key:'price',label:'Price',previousValue:'R 2,500,000',currentValue:'R 2,450,000'}]},issues:channel==='Private Property'&&!accepted[channel]?['The previous price update failed.']:[],warnings:channel==='Private Property'?['The original advert address is retained by Private Property.']:[],activity:[{id:'event',title:channel+' advert submitted',at:'2026-10-12T19:39:00Z',detail:'Existing advert reference retained.'}]}} expiryDate={expiry} minExpiryDate='2026-10-13' canUpdateExpiry={!offline[channel]} activeExpiryChannels={['Property24','Private Property']} canUpdate={!offline[channel]} canRelist={status==='active'} canWithdraw={!offline[channel]} canExpire={channel==='Property24'&&!offline[channel]} onClose={()=>setChannel('')} onSave={save} onSaveExpiry={async({expiryDate,applyToAllChannels})=>{const targets=applyToAllChannels?['Property24','Private Property']:[channel];for(const target of targets)await send(target,'expiry',{expiryDate});setExpiry(expiryDate);return{ok:true,message:'Listing expiry saved.'}}} onFix={()=>{setChannel('');history.pushState({},'','/editor');document.getElementById('fixture-editor').hidden=false}} onRefresh={()=>send(channel,'status')} onPreview={()=>send(channel,'preview')} onUpdate={async()=>{await send(channel,'update');setAccepted(v=>({...v,[channel]:true}));return{ok:true}}} onRetry={async()=>{await send(channel,'retry');setAccepted(v=>({...v,[channel]:true}));return{ok:true}}} onSavePublicUrl={async value=>{await send(channel,'save-link',{value});setLinks(v=>({...v,[channel]:value}));return{ok:true}}} onRelist={()=>handoff('relist')} onWithdraw={()=>handoff('withdraw')}  onVerify={()=>send(channel,'verify')}/>}{channel==='Agency Website'&&<Dialog channelName='Agency Website' listingStatus={status} listing={{address:'24 Oak Avenue, Randburg',priceLabel:'R 2,450,000',reference:'A9-TEST-100001'}} portal={{reference:'A9-TEST-100001',statusLabel:websitePublished?'Live on website':'Not on website',publicUrl:websitePublished?'https://agency.example/properties/oak-avenue-listing-1':'',issues:websiteReadiness.issues}} preparationMessage={!websitePublished?websiteReadiness.preparationMessage:''} canPublish={!websitePublished} onPublish={!websitePublished?async()=>{await send('Agency Website','publish');setWebsitePublished(true);return{ok:true,message:'Agency Website listing published.'}}:undefined} canUpdate={websitePublished} onUpdate={websitePublished?()=>send('Agency Website','update'):undefined} onClose={()=>setChannel('')} onSave={save}/>}<p id='fixture-editor' hidden>Listing details editor</p>
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
        res.end(JSON.stringify({ ok: true, portalStatus: body.action==='status'&&body.channel==='Private Property'?'submitted':undefined, message: body.action==='status'?'Latest portal status checked.':body.action==='preview'?'Listing requirements passed.':body.action==='save-link'?'Live portal link saved.':undefined })); return
      } catch(error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); return }
    }
    if (req.url === '/fixture-entry.jsx') { res.setHeader('Content-Type','application/javascript'); const transformed = await server.transformRequest('/fixture-entry.jsx'); res.end(transformed.code); return }
    if (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/editor')) { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><html><head><title>Manage listing acceptance</title><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/fixture-entry.jsx"></script></body></html>'); return }
    next()
  }) },
  resolveId(id) { if (id === '/fixture-entry.jsx') return '\0fixture-entry.jsx' },
  load(id) { if (id === '\0fixture-entry.jsx') return transformSync(entry, { loader: 'jsx', jsx: 'transform' }).code },
}], css: { postcss: { plugins: [tailwindcss({ ...tailwindConfig, content: [{ raw: entry, extension: 'jsx' }, ...['src/components/listings/ListingChannelManageDialog.jsx', 'src/components/listings/ListingRelistDialog.jsx', 'src/components/ui/Button.jsx', 'src/components/ui/Field.jsx', 'src/components/ui/Modal.jsx'].map(file => path.join(root, file))] }), autoprefixer()] } }, optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'lucide-react', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'] }, server: { host: '127.0.0.1', port: 0, strictPort: false }, define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' } })
let browser
try {
  await server.listen(); const origin=new URL(server.resolvedUrls.local[0]).origin
  browser=await chromium.launch({ headless:true })
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000)
  await page.goto(origin, {waitUntil:'domcontentloaded'}); const button=name=>page.getByRole('button',{name,exact:true}); const open=channel=>button('Manage '+channel).click(); const done=()=>button('Done').click()
  const requestCount=()=>events.length
  const record=name=>{checks.push({name,status:'passed'});console.log('PASS',name)}
  await open('Private Property');assert.equal(await page.getByRole('heading',{name:'Manage Private Property listing'}).count(),1)
  assert.equal(await button('Expire advert').count(),0);assert.equal(await button('Listing expiry').count(),1)
  await page.screenshot({path:path.join(out,'private-property-desktop.png'),fullPage:true});record('Direct portal popup; scheduled expiry available on Private Property')
  await page.getByRole('tab',{name:'Recent activity'}).click();assert.equal(await page.getByText('Private Property advert submitted').isVisible(),true);await page.getByRole('tab',{name:'Overview'}).click();record('Recent activity and overview tabs')
  const before=requestCount();await button('Update advert').click();await button('Cancel').click();assert.equal(requestCount(),before);record('Cancelled update sends nothing')
  await button('Check latest status').click();await page.getByText('Latest portal status checked.').waitFor();assert.equal(events.at(-1).channel,'Private Property');assert.equal(events.at(-1).action,'status');record('Fresh status targets selected portal')
  let releasePreview
  await page.route('**/fixture/action', async route => {
    if (route.request().postDataJSON()?.action === 'preview') await new Promise(resolve => { releasePreview = resolve })
    await route.continue()
  })
  await button('Check requirements').click()
  const progress = page.getByRole('dialog').getByRole('status').filter({ hasText: 'Checking Private Property requirements…' })
  await progress.waitFor();assert.equal(await button('Done').isDisabled(), true)
  await page.screenshot({ path: path.join(out, 'readiness-progress-desktop.png'), fullPage: true })
  assert.ok(releasePreview);releasePreview()
  await page.getByRole('dialog').getByText('Listing requirements passed.').waitFor();assert.equal(events.at(-1).action,'preview');record('Readiness progress and result are visible inside the popup')
  await page.getByText('Edit live portal link',{exact:true}).click();await page.getByLabel('Live portal link').fill('https://www.property24.com/for-sale/example/123');await button('Save link').click();await page.getByRole('alert').filter({hasText:'exact HTTPS Private Property'}).waitFor();assert.notEqual(events.at(-1).action,'save-link');record('Wrong-portal live link rejected without request')
  const savedLink='https://www.privateproperty.co.za/for-sale/example/T999';await page.getByLabel('Live portal link').fill(savedLink);await button('Save link').click();await page.getByText('Live portal link saved.').waitFor();assert.equal(await page.getByRole('link',{name:'View advert'}).getAttribute('href'),savedLink);record('Live link saved and View advert updated')
  await page.request.post(origin+'/fixture/reset',{data:{failNext:'update'}});await button('Update advert').click();await button('Send update').click();await page.getByRole('alert').filter({hasText:'Portal temporarily unavailable'}).waitFor();record('Failed update remains visible in popup')
  await button('Send update').click();await page.getByText('Update accepted. Check the public advert to confirm it.').waitFor();assert.equal(events.at(-1).channel,'Private Property');record('Update retry stays on the selected portal')
  await button('Confirm public advert is current').click();await button('Cancel').click();const beforeVerify=requestCount();await button('Confirm public advert is current').click();await button('Confirm verification').click();await page.getByText('Public advert verification saved.').waitFor();assert.equal(events.length,beforeVerify+1);assert.equal(events.at(-1).action,'verify');record('Public verification requires confirmation')
  await button('Relist / reactivate').click();assert.equal(await page.getByRole('checkbox',{name:'Private Property',exact:true}).isChecked(),true);assert.equal(await page.getByRole('checkbox',{name:'Property24',exact:true}).count(),0);await page.getByRole('checkbox',{name:'This is the same property as the original advert.'}).check();await button('Relist selected channels').click();await page.getByText('Portal confirms reactivation.').waitFor();assert.equal(events.at(-1).channel,'Private Property');await button('Done').click();record('Relist confirms identity and keeps selected portal')
  await open('Private Property');await button('Withdraw advert').click();const beforeCancel=requestCount();await button('Cancel').click();assert.equal(requestCount(),beforeCancel);await open('Private Property');await button('Withdraw advert').click();await button('Withdraw listing').click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(events.at(-1).channel,'Private Property');assert.equal(events.at(-1).action,'withdraw');record('Withdrawal confirmation and cancellation')
  await open('Property24');await button('Listing expiry').click();await page.getByLabel('Listing expiry date').fill('2020-10-01');assert.equal(await button('Next').isDisabled(),true);await page.getByLabel('Listing expiry date').fill('2099-12-31');await button('Next').click();const beforeExpiry=requestCount();await page.getByText('Apply this expiry to all other active channels?').waitFor();assert.equal(requestCount(),beforeExpiry);await button('Only Property24').click();await page.getByText('Listing expiry saved.').waitFor();assert.equal(events.at(-1).channel,'Property24');assert.equal(events.at(-1).action,'expiry');record('Expiry validation, separate scope confirmation and selected-portal save')
  await button('Listing expiry').click();await page.getByLabel('Listing expiry date').fill('2099-11-30');await button('Next').click();await page.screenshot({path:path.join(out,'expiry-confirmation-desktop.png'),fullPage:true});await button('Apply to all active channels').click();await page.getByText('Listing expiry saved.').waitFor();assert.deepEqual(events.slice(-2).map(e=>e.channel),['Property24','Private Property']);record('All active portals receive chosen expiry date')
  await button('Done').click();
  await page.goto(origin, {waitUntil:'domcontentloaded'});await open('Property24');await button('Change listing status').click();await page.getByLabel('Listing status').selectOption('under_offer');await button('Save changes').click();await page.getByText('Listing status saved. Channel results are shown below.').waitFor();assert.deepEqual(events.slice(-2).map(e=>e.channel),['Property24','Private Property']);record('Under offer sends whole-listing status to active channels')
  await button('Change listing status').click();await page.getByLabel('Listing status').selectOption('sold');await button('Save changes').click();await page.getByText('Listing status saved. Channel results are shown below.').waitFor();assert.equal(await button('Change listing status').isDisabled(),true);record('Sold sends status and disables further sale changes')
  await done();await open('Property24');await button('Edit listing details').click();await page.getByText('Listing details editor').waitFor();record('Edit opens listing editor')
  await page.goto(origin, {waitUntil:'domcontentloaded'});await page.setViewportSize({width:390,height:844});await open('Private Property');await page.screenshot({path:path.join(out,'private-property-mobile.png'),fullPage:true});const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false);record('Mobile popup has no horizontal overflow')
  releasePreview = null
  await button('Check requirements').click();await progress.waitFor()
  const box = await progress.boundingBox()
  assert.ok(box && box.y >= 0 && box.y + box.height <= 844, 'Mobile readiness feedback must be inside the visible popup viewport')
  await page.screenshot({ path: path.join(out, 'readiness-progress-mobile.png'), fullPage: true })
  assert.ok(releasePreview);releasePreview()
  await page.getByRole('dialog').getByText('Listing requirements passed.').waitFor();record('Mobile readiness scrolls progress and results into view')
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});record('Escape closes the popup')
  await page.goto(origin, {waitUntil:'domcontentloaded'});await page.setViewportSize({width:1280,height:900});await open('Agency Website')
  await page.getByRole('dialog').getByText(/prepares website copies of the photos automatically/).waitFor()
  assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0)
  assert.equal(await page.getByRole('link',{name:'View advert'}).count(),0)
  await page.screenshot({path:path.join(out,'agency-website-preparation.png'),fullPage:true})
  const beforePublish=requestCount();await button('Publish to website').click();assert.equal(requestCount(),beforePublish);await button('Publish listing').click()
  await page.getByRole('dialog').getByText('Agency Website listing published.').waitFor();assert.equal(events.length,beforePublish+1);assert.equal(events.at(-1).channel,'Agency Website');assert.equal(events.at(-1).action,'publish')
  assert.equal(await page.getByRole('link',{name:'View advert'}).getAttribute('href'),'https://agency.example/properties/oak-avenue-listing-1');record('Website preparation is automatic and publication requires confirmation')
  await button('Update advert').click();await button('Send update').click();await page.getByText('Update accepted. Check the public advert to confirm it.').waitFor();assert.equal(events.at(-1).channel,'Agency Website');assert.equal(events.at(-1).action,'update');record('A published website listing can be updated in the same popup')
  await done()
  await page.goto(origin+'/?simple-update=1', {waitUntil:'domcontentloaded'});await open('Private Property')
  assert.equal(await button('Check requirements').isVisible(),false)
  const beforeSimple=requestCount()
  await button('Save and update Private Property').click()
  await page.getByText(/^Processing\. Private Property accepted the update/).waitFor()
  assert.deepEqual(events.slice(beforeSimple).map(event=>[event.channel,event.action]),[['Private Property','update'],['Private Property','status']])
  assert.equal(await button('Send update').count(),0)
  await page.screenshot({path:path.join(out,'private-property-simple-update-desktop.png'),fullPage:true})
  record('One action updates the existing Private Property advert and checks status automatically')
  await done();await page.setViewportSize({width:390,height:844});await open('Private Property')
  const updateBox=await button('Save and update Private Property').boundingBox()
  assert.ok(updateBox&&updateBox.y>=0&&updateBox.y+updateBox.height<=844,'The main mobile update action is visible without scrolling')
  assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+2),false)
  await page.screenshot({path:path.join(out,'private-property-simple-update-mobile.png'),fullPage:true})
  await page.getByText('More actions',{exact:true}).click()
  assert.equal(await button('Withdraw advert').isVisible(),true)
  record('Mobile update is visible immediately; other actions remain available')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({checks:checks.length,requests:events.length,externalRequests:'blocked',screenshots:out}))
} finally {
  await writeFile(path.join(out,'browser-results.json'),JSON.stringify({checks,events,errors},null,2))
  await browser?.close();await server.close()
}
