// Real address controls and capture forms; Google responses and lead ingestion
// are local doubles. External requests are blocked.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer as createSocket } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { chromium } from 'playwright'
import tailwindConfig from '../tailwind.config.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = path.resolve(root, '../output/playwright/address-gaps-20261015')
await mkdir(out, { recursive: true })
const full = '1547 Bougainvillea Drive, Montana Tuine, Pretoria, 0182, South Africa'
const app = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import AddressInput from '${root}/src/components/location/AddressInput.jsx';
import{MemoryRouter}from'react-router-dom';
import{SellerOnboarding}from'${root}/src/pages/SellerOnboarding.jsx';
import{selectedAddressFields}from'${root}/src/components/location/addressInputModel.js';
import RentalLeadDialog,{INITIAL_RENTAL_LEAD_FORM}from'${root}/src/pages/rentals/RentalLeadDialog.jsx';
import{LeadForm}from'${root}/../apps/websites/components/lead-form.tsx';
import'${root}/src/index.css';
import'${root}/../apps/websites/app/styles.css';
import'${root}/../apps/websites/app/kingdom.css';
const sellerDraft={sellerOnboarding:{status:'not_started',formData:{ownershipDeclarationPending:true,ownershipType:'',ownerEntityType:'',ownerStructureType:'',sellerFirstName:'',sellerSurname:'',email:'',phone:'',propertyCategory:'',propertyType:'',propertyStructureType:''}}};
function App(){const[mode,setMode]=useState('address');const[fields,setFields]=useState({addressLine1:'',city:'',postalCode:'',owner:'Test Owner'});const[rental,setRental]=useState({...INITIAL_RENTAL_LEAD_FORM,firstName:'Test',lastName:'Owner',phone:'0825550101'});const[result,setResult]=useState('');
return <main style={{maxWidth:720,margin:'24px auto',padding:16}}><h1>Address capture</h1><nav style={{display:'flex',gap:16,flexWrap:'wrap',margin:'20px 0'}}><button onClick={()=>setMode('address')}>Address form</button><button onClick={()=>setMode('seller')}>Seller capture</button><button onClick={()=>setMode('rental')}>Rental capture</button><button onClick={()=>setMode('website')}>Website valuation</button></nav>
{mode==='address'?<form onSubmit={e=>{e.preventDefault();setResult(JSON.stringify({values:Object.fromEntries(new FormData(e.currentTarget)),fields}))}}><label>Property address<AddressInput name='propertyAddress' required addressFormat='street' value={fields.addressLine1} onChange={e=>setFields(p=>({...p,addressLine1:e.target.value}))} onAddressSelect={a=>setFields(p=>({...p,...selectedAddressFields(a)}))}/></label><label>City<input name='city' value={fields.city} readOnly/></label><label>Postal code<input name='postalCode' value={fields.postalCode} readOnly/></label><button type='submit'>Save address</button></form>:null}
{mode==='rental'?<RentalLeadDialog form={rental} onChange={(k,v)=>setRental(p=>({...p,[k]:v}))} onClose={()=>setMode('address')} onSubmit={e=>{e.preventDefault();setResult(JSON.stringify(rental));setMode('address')}} saving={false}/>:null}
{mode==='seller'?<MemoryRouter><SellerOnboarding embedded captureLayout='tabs' captureAutosave captureDraft={sellerDraft} completionModeOverride='agent_assisted' onCapturePersist={async row=>{const saved={...row,id:'seller-fixture',sellerOnboarding:{...row.sellerOnboarding,token:'local-fixture-token'}};setResult(JSON.stringify(saved));return saved}}/></MemoryRouter>:null}
{mode==='website'?<section className='template-kingdom'><div className='enquiry-section'><LeadForm variant='valuation' purpose='valuation_request'/></div></section>:null}<pre data-testid='saved' style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:24}}>{result}</pre></main>};createRoot(document.getElementById('root')).render(<App/>);`
const google = `window.__addressRequests=[];const full=${JSON.stringify(full)};const components=[['1547','street_number'],['Bougainvillea Drive','route'],['Montana Tuine','sublocality_level_1'],['Pretoria','locality'],['Gauteng','administrative_area_level_1'],['0182','postal_code'],['South Africa','country']].map(([longText,type])=>({longText,types:[type]}));const place={id:'fixture-place',formattedAddress:full,addressComponents:components,location:{lat:-25.68,lng:28.25},fetchFields:async options=>{window.__addressRequests.push({fields:options.fields})}};const prediction={placeId:'fixture-place',text:{toString:()=>full},mainText:{toString:()=> '1547 Bougainvillea Drive'},secondaryText:{toString:()=> 'Montana Tuine, Pretoria'},toPlace:()=>place};const library={AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async req=>{window.__addressRequests.push({input:req.input,regions:req.includedRegionCodes,session:!!req.sessionToken});return{suggestions:[{placePrediction:prediction}]}}}};window.google={maps:{importLibrary:async()=>library}};`
const receipts = []
const port = await new Promise((resolve, reject) => {
  const socket = createSocket()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => { const address = socket.address(); socket.close(() => resolve(address.port)) })
})
const plugin = { name: 'address-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (req.url === '/api/leads' && req.method === 'POST') { let body='';for await(const chunk of req)body+=chunk;receipts.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,reference:'fixture-receipt'}));return }
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/', '<!doctype html><html><body><div id="root"></div><script src="/fixture-google.js"></script><script type="module" src="/fixture-app.jsx"></script></body></html>'));return}next()
}) }, resolveId(id) { if(['/fixture-app.jsx','/fixture-google.js'].includes(id))return id }, load(id) { if(id==='/fixture-app.jsx')return app;if(id==='/fixture-google.js')return google } }
const server = await createServer({ root, configFile:false, envFile:false, plugins:[plugin,react()],
  cacheDir: path.join(out,'vite-cache'),
  optimizeDeps: { noDiscovery:true, include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','react-router-dom','@supabase/supabase-js','lucide-react','clsx','tailwind-merge'] },
  resolve:{dedupe:['react','react-dom']}, css:{postcss:{plugins:[tailwindcss({...tailwindConfig,content:[`${root}/src/components/location/*`,`${root}/src/pages/rentals/RentalLeadDialog.jsx`,`${root}/src/components/ui/Modal.jsx`,`${root}/src/pages/SellerOnboarding.jsx`]}),autoprefixer()]}},
  server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[path.resolve(root,'..')]}}, define:{'import.meta.env.VITE_GOOGLE_MAPS_API_KEY':'"fixture-only"','import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""','process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY':'"fixture-only"'} })
let browser, page
const checks=[]
const pass=name=>{checks.push(name);console.log('PASS',name)}
try {
  await server.listen();const origin=new URL(server.resolvedUrls.local[0]).origin
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});const external=[]
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort()})
  page=await context.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin,{waitUntil:'domcontentloaded'})
  try { await page.getByRole('heading',{name:'Address capture',exact:true}).waitFor({timeout:20000}) }
  catch (error) { console.error('Browser fixture errors:', JSON.stringify(errors)); throw error }
  const address=page.getByRole('combobox',{name:/Property address/});await address.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().waitFor();await page.screenshot({path:path.join(out,'address-suggestions-desktop.png'),fullPage:true});await address.press('ArrowDown');await address.press('Enter');await page.getByLabel('City',{exact:true}).inputValue().then(value=>assert.equal(value,'Pretoria'));await page.getByRole('button',{name:'Save address',exact:true}).click();let saved=JSON.parse(await page.getByTestId('saved').textContent());assert.equal(saved.values.propertyAddress,'1547 Bougainvillea Drive');assert.equal(saved.fields.postalCode,'0182');assert.equal(saved.fields.owner,'Test Owner');assert.equal(saved.fields.googlePlaceId,'fixture-place');pass('Google selection fills address details and preserves owner data through form submission')
  await page.getByRole('button',{name:'Rental capture',exact:true}).click();const rentalAddress=page.getByRole('combobox',{name:/Property address/});await rentalAddress.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().click();await page.getByRole('button',{name:'Create Rental Lead',exact:true}).click();saved=JSON.parse(await page.getByTestId('saved').textContent());assert.equal(saved.firstName,'Test');assert.equal(saved.propertyAddress,full);assert.equal(saved.propertyAddressData.city,'Pretoria');assert.equal(saved.propertyAddressData.latitude,-25.68);pass('Real rental capture retains contact details and selected address metadata')
  await page.getByRole('button',{name:'Seller capture',exact:true}).click();await page.getByLabel('First name',{exact:true}).fill('Test Seller');const sellerAddress=page.getByRole('combobox',{name:/^Address(?:\s|$)/});await sellerAddress.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().click();await page.getByRole('tab',{name:'Property details',exact:true}).click();assert.equal(await page.getByLabel('Address line 1',{exact:true}).inputValue(),'1547 Bougainvillea Drive');assert.equal(await page.getByLabel('City',{exact:true}).inputValue(),'Pretoria');assert.equal(await page.getByLabel('Postal Code',{exact:true}).inputValue(),'0182');await page.getByRole('button',{name:'Save lead',exact:true}).click();saved=JSON.parse(await page.getByTestId('saved').textContent());assert.equal(saved.sellerOnboarding.formData.sellerFirstName,'Test Seller');assert.equal(saved.sellerOnboarding.formData.propertyAddressDetails.placeId,'fixture-place');assert.equal(saved.sellerOnboarding.formData.propertyAddressDetails.source,'google_places');pass('Seller lead address selection fills and saves the shared property details')
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Lead details',exact:true}).click();await sellerAddress.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);const mobileOption=page.getByRole('option',{name:/Bougainvillea/}).first();const optionBox=await mobileOption.boundingBox();assert.ok(optionBox && optionBox.y>=0 && optionBox.y+optionBox.height<=844,'The mobile suggestion must be inside the visible viewport');assert.equal(await mobileOption.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2))}),true,'The mobile suggestion must not be clipped by the form');await page.screenshot({path:path.join(out,'seller-address-suggestions-mobile.png'),fullPage:false});await mobileOption.click();await page.setViewportSize({width:1280,height:900});pass('Seller address suggestions are visible and selectable on mobile')
  await page.getByRole('button',{name:'Website valuation',exact:true}).click();const websiteAddress=page.getByRole('combobox',{name:/Property address/});await websiteAddress.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().click();assert.equal(await websiteAddress.inputValue(),full);await page.getByLabel('Full name',{exact:true}).fill('Website Test');await page.getByLabel('Mobile number',{exact:true}).fill('0825550101');await page.getByRole('checkbox',{name:'I agree to be contacted about my enquiry.',exact:true}).check();await page.getByRole('button',{name:/Request my valuation/}).click();await page.getByText('Thank you. Your enquiry has been sent.').waitFor();assert.equal(receipts.length,1);assert.ok(receipts[0].message.includes(full));assert.equal(await websiteAddress.inputValue(),'');pass('Website address reaches lead ingestion and clears after confirmed submission')
  await page.setViewportSize({width:390,height:844});await websiteAddress.fill('1547 Boug');await page.getByRole('option',{name:/Bougainvillea/}).first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.equal(await page.getByRole('listbox').evaluate(element=>element.scrollWidth>element.clientWidth+2),false);await page.screenshot({path:path.join(out,'website-address-suggestions-mobile.png'),fullPage:true});pass('Mobile address suggestions wrap without horizontal clipping')
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);pass('No browser exceptions or external requests')
  await writeFile(path.join(out,'results.json'),JSON.stringify({checks,syntheticGoogle:true,localLeadReceipts:receipts.length,externalRequests:external.length},null,2))
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:false});console.error('Browser failure state:',(await page.locator('body').ariaSnapshot()).slice(0,4000))}throw error}finally{await browser?.close();await server.close()}
