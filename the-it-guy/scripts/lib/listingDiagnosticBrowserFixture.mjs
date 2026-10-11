import { getSellerOnboardingSaveRevision } from '../../src/services/listings/listingSellerCanonicalUpdateModel.js';
import { buildCanonicalSellerOnboardingPayload } from '../../src/services/documents/sellerOnboardingFactTransformer.js';
// Real forms and rental SQL; synthetic account, sales persistence, storage and providers.
// Project Vite config and environment files are disabled; loopback only.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRentalListingAcceptanceFixture } from './rentalListingAcceptanceFixture.mjs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function startListingDiagnosticBrowserFixture(out, { saleSource = null, traceEvents = true, realRentalDetail = false, navigationChecks = false } = {}) {
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const f = await createRentalListingAcceptanceFixture();
  const {
    db,
    actor,
    org
  } = f;
  await db.exec('reset role;create table diagnostic_records(id uuid primary key,data jsonb);grant all on diagnostic_records to authenticated;set role authenticated;');
  const origin = 'http://127.0.0.1:4241',
    events = [],
    jobs = new Map();
  let portfolio = [];
  let failure = '';
  const camel = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
  const snake = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]));
  const getExtra = async id => (await db.query('select data from diagnostic_records where id=$1', [id])).rows[0]?.data || null;
  const putExtra = async (id, data) => db.query('insert into diagnostic_records values($1,$2::jsonb) on conflict(id) do update set data=excluded.data', [id, JSON.stringify(data)]);
  async function readListing(id) {
    const extra = await getExtra(id);
    if (!extra) return null;
    if (extra.listingCategory !== 'rental') return {
      ...extra,
      // Match getPrivateListing's distribution-media projection. An empty
      // creation-time gallery must not hide photos subsequently saved.
      galleryImages: extra.listingMedia?.length ? extra.listingMedia.filter(row => row.media_type === 'image').map(row => ({ id: row.id, url: row.file_url, name: row.caption, isCover: row.is_cover })) : extra.galleryImages || extra.propertyDetails?.galleryImages || []
    };
    const row = (await db.query('select * from private_listings where id=$1', [id])).rows[0];
    const media = (await db.query('select * from listing_media where listing_id=$1 order by sort_order,id', [id])).rows;
    const links = (await db.query('select * from listing_external_links where listing_id=$1', [id])).rows;
    const pub = (await db.query('select * from listing_publication_data where listing_id=$1', [id])).rows[0];
    for (const key of ['asking_price', 'bathrooms', 'floor_size', 'erf_size', 'rates_taxes', 'levies']) if (pub?.[key] != null) pub[key] = Number(pub[key]);
    return {
      ...extra,
      ...camel(row),
      assignedAgentId: actor,
      listingType: 'rental',
      sellerCanonicalFacts: row.seller_canonical_facts_json,
      listingPublicationData: pub ? camel(pub) : null,
      listingMedia: media,
      listingExternalLinks: links
    };
  }
  async function create(payload, options) {
    const id = options.creationId || options.rentalCreationId || randomUUID();
    const existing = await readListing(id);
    if (existing) return {
      listing: existing,
      existing: true
    };
    const data = {
      ...payload,
      id,
      updatedAt: new Date().toISOString(),
      listingType: payload.listingCategory === 'rental' ? 'rental' : 'sale',
      documents: [],
      documentRequirements: [],
      listingMedia: [],
      listingExternalLinks: []
    };
    await putExtra(id, data);
    if (payload.listingCategory === 'rental') {
      await db.exec('reset role');
      try {
        await db.query('insert into private_listings(id,organisation_id,listing_category,title,property_category,property_type,seller_canonical_facts_json,updated_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)', [id, org, 'rental', payload.title, payload.propertyCategory, payload.propertyType, JSON.stringify(payload.sellerCanonicalFacts), data.updatedAt]);
      } finally {
        await db.exec('set role authenticated');
      }
    }
    return {
      listing: await readListing(id)
    };
  }
  const rpcFields = {
    save_rental_listing_snapshot_v2: ['p_listing_id', 'p_expected_updated_at', 'p_listing_patch', 'p_publication', 'p_gallery', 'p_cover_index', 'p_media_edits'],
    save_rental_listing_gallery_v2: ['p_listing_id', 'p_expected_updated_at', 'p_gallery', 'p_cover_index'],
    save_rental_listing_expiry_v1: ['p_listing_id', 'p_expected_updated_at', 'p_expiry_date']
  };
  async function action(kind, b) {
    events.push({
      kind,
      at: new Date().toISOString(),
      body: b
    });
    if (traceEvents) await writeFile(out + '/events.json', JSON.stringify(events, null, 2));
    if (kind === 'workspace-settings') return { organisation: { id: org, name: 'Diagnostic agency' } };
    if (kind === 'workspace-users') return [{ id: actor, userId: actor, fullName: 'Diagnostic Agent', email: 'agent@example.test' }];
    if (['workspace-transactions', 'workspace-assignments', 'workspace-developments'].includes(kind)) return [];
    if (kind === 'website-status') return { available: true, websiteSiteId: 'fixture', status: 'draft' };
    if (kind === 'all') {
      const ids = (await db.query('select id from diagnostic_records')).rows;
      return [...portfolio, ...await Promise.all(ids.map(x => readListing(x.id)))];
    }
    if (kind === 'read') return readListing(b.id);
    if (kind === 'create') return create(b.payload, b.options || {});
    if (kind === 'update') {
      let row = await readListing(b.id);
      Object.assign(row, b.payload, {
        updatedAt: new Date().toISOString()
      });
      await putExtra(b.id, row);
      if (row.listingCategory === 'rental') await db.query('update private_listings set listing_status=coalesce($2,listing_status),title=coalesce($3,title),updated_at=$4 where id=$1', [b.id, b.payload.listingStatus || null, b.payload.title || null, row.updatedAt]);
      return readListing(b.id);
    }
    if (kind === 'onboarding') {
      const row = await readListing(b.listingId);
      const expected = getSellerOnboardingSaveRevision(b.listingSnapshot || {});
      const actual = getSellerOnboardingSaveRevision(row);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Fixture: stale seller revision');
      const form = b.formData;
      // Use the production projection; persistence itself remains simulated here.
      row.sellerCanonicalFacts = buildCanonicalSellerOnboardingPayload(form, row, { draft: true }).canonicalSellerFacts;
      row.sellerOnboarding = {
        id: row.sellerOnboarding?.id || randomUUID(),
        updatedAt: new Date().toISOString(),
        formData: form
      };
      row.propertyDetails = {
        ...row.propertyDetails,
        ...form
      };
      await putExtra(row.id, row);
      return {
        id: row.sellerOnboarding.id,
        updated_at: row.sellerOnboarding.updatedAt,
        canonical_facts_json: row.sellerCanonicalFacts,
        form_data: form
      };
    }
    if (kind === 'distribution') {
      if (failure === 'distribution') {
        failure = '';
        throw new Error('Diagnostic: save response interrupted');
      }
      const row = await readListing(b.id);
      const pub = {
        listing_id: b.id,
        ...snake(b.payload.publicationData)
      };
      row.listingPublicationData = camel(pub);
      row.propertyDetails = {
        ...row.propertyDetails,
        ...b.payload.publicationData,
        price: b.payload.publicationData.askingPrice,
        galleryImages: b.payload.media.galleryImages
      };
      row.listingMedia = b.payload.media.galleryImages.map((x, i) => ({
        id: randomUUID(),
        listing_id: b.id,
        media_type: 'image',
        file_url: x.url,
        caption: x.name,
        sort_order: i,
        is_cover: x.id === b.payload.media.coverImageId
      }));
      row.marketing = {
        description: b.payload.publicationData.description,
        galleryImages: b.payload.media.galleryImages
      };
      await putExtra(b.id, row);
      return {
        publication: pub,
        media: row.listingMedia
      };
    }
    if (kind === 'upload') {
      if (failure === 'upload') {
        failure = '';
        throw new Error('Diagnostic: photo upload interrupted');
      }
      return {
        url: 'https://fixture.invalid/photo.png?name=' + encodeURIComponent(b.name),
        fileName: b.name,
        contentType: 'image/png',
        size: b.size
      };
    }
    if (kind === 'rpc') {
      if (!rpcFields[b.name]) throw new Error('Unsupported local RPC ' + b.name);
      const fields = rpcFields[b.name];
      const vals = fields.map(k => typeof b.args[k] === 'object' && b.args[k] !== null ? JSON.stringify(b.args[k]) : b.args[k]);
      return (await db.query('select public.' + b.name + '(' + fields.map((_, i) => '$' + (i + 1)).join(',') + ') as receipt', vals)).rows[0].receipt;
    }
    if (kind === 'jobs') return jobs.get(b.id) || [];
    if (kind === 'seed-jobs') { jobs.set(b.id, b.jobs); return true; }
    if (kind === 'failure') {
      failure = b.value;
      return true;
    }
    if (kind === 'events') return events;
    if (kind === 'activity') return {
      id: randomUUID()
    };
    throw new Error('Unknown fixture action ' + kind);
  }
  const request = `export const request=async(kind,body={})=>{const r=await fetch('/fixture/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const p=await r.json();if(p.error)throw Object.assign(new Error(p.error.message),p.error);return p.data};`;
  const ctx = {
    workspace: {
      id: org,
      name: 'Diagnostic agency',
      type: 'agency'
    },
    currentWorkspace: {
      id: org,
      name: 'Diagnostic agency'
    },
    profile: {
      id: actor,
      fullName: 'Diagnostic Agent',
      email: 'agent@example.test'
    },
    role: 'agent',
    workspaceRole: 'principal',
    agencyWorkflowMode: 'agent',
    currentMembership: {
      organisationId: org,
      role: 'principal'
    }
  };
  const modules = new Map([['src/context/WorkspaceContext.jsx', `const ctx=${JSON.stringify(ctx)};export const useWorkspace=()=>ctx;`], ['src/context/OrganisationContext.jsx', `export const useOptionalOrganisation=()=>null;`], ['src/lib/supabaseClient.js', `${request}export const isSupabaseConfigured=true;function from(table){let eq={};let q={select(){return q},eq(k,v){eq[k]=v;return q},in(){return q},order(){return q},limit(){return q},range(){return q},is(){return q},or(){return q},not(){return q},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:null,error:null}),then(resolve,reject){return (table==='listing_publication_jobs'?request('jobs',{id:eq.listing_id}).then(data=>({data,error:null})):Promise.resolve({data:[],error:null})).then(resolve,reject)},insert(){throw new Error('Unmocked fixture insert '+table)},update(){throw new Error('Unmocked fixture update '+table)}};return q}export const supabase={from,rpc:async(name,args)=>{try{return{data:await request('rpc',{name,args}),error:null}}catch(error){return{data:null,error}}},auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}}),getUser:async()=>({data:{user:{id:'${actor}'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};export const clearSupabaseLocalAuthState=async()=>{};export const isUnsupportedJwtAlgorithmError=()=>false;export const isUserFromSubClaimMissingError=()=>false;export const createScopedSupabaseClient=()=>supabase;export const invokeEdgeFunction=async()=>{throw new Error('External functions disabled')};export const getEdgeFunctionInvokeError=r=>r?.error;export const assertEdgeFunctionSuccess=r=>r?.data;export const DOCUMENTS_BUCKET='documents',DOCUMENTS_BUCKET_CANDIDATES=['documents'],LEGAL_TEMPLATES_BUCKET='legal-templates',LEGAL_TEMPLATES_BUCKET_CANDIDATES=['legal-templates'],BRANDING_BUCKET='organisation-branding',BRANDING_BUCKET_CANDIDATES=['organisation-branding'],PROFILE_AVATAR_BUCKET='profile-avatars',PROFILE_AVATAR_BUCKET_CANDIDATES=['profile-avatars'];`], ['src/lib/settingsApi.js', `${request}export * from '/src/lib/settingsApi.js?original';export const fetchOrganisationSettings=()=>request('workspace-settings');export const listOrganisationUsers=()=>request('workspace-users');`], ['src/lib/api.js', `${request}export * from '/src/lib/api.js?original';export const fetchAssignedDevelopmentIdsForRole=()=>request('workspace-assignments');export const fetchDevelopmentOptions=()=>request('workspace-developments');export const fetchUnitsForTransactionSetup=async()=>[];`], ['src/domains/reporting/api.js', `${request}export * from '/src/domains/reporting/api.js?original';export const fetchTransactionsByParticipantSummary=()=>request('workspace-transactions');`], ['src/services/privateListingService.js', `${request}export * from '/src/services/privateListingService.js?original';export const getPrivateListing=id=>request('read',{id});export const getAgentPrivateListingSummaries=()=>request('all');export const getAgentPrivateListings=()=>request('all');export const getPrivateListingCoverImageUrls=async()=>({});export const createPrivateListing=(payload,options)=>request('create',{payload,options});export const updatePrivateListing=(id,payload)=>request('update',{id,payload});export const persistSellerProfileOnboardingFormData=payload=>request('onboarding',payload);export const syncPrivateListingDistributionData=(id,payload)=>request('distribution',{id,payload});export const createPrivateListingActivity=payload=>request('activity',payload);export const uploadPrivateListingMediaAsset=(file,options)=>request('upload',{name:file.name,size:file.size,...options});export const signPrivateListingMediaAsset=async asset=>({...asset,url:'${origin}/fixture/photo.png'});export const getPrivateListingDocuments=async()=>[];export const getPrivateListingDocumentRequirements=async()=>[];export const syncPrivateListingRequirements=async()=>({});`], ['src/services/rentals/rentalLeadService.js', `export * from '/src/services/rentals/rentalLeadService.js?original';export const listRentalLeads=async()=>[];`], ['src/services/rentals/rentalLandlordMandateRepository.js', `export * from '/src/services/rentals/rentalLandlordMandateRepository.js?original';export const listRentalPropertyMandates=async()=>[];`], ['src/services/listings/listingSellerLeadService.js', `export const ensureListingSellerLead=async()=>null;`], ['src/services/syndicationChannelAvailabilityService.js', `export const UNAVAILABLE_SYNDICATION_CHANNELS={property24:{available:true},private_property:{available:true},agency_website:{available:true,label:'Agency website'}};export const getSyndicationChannelAvailability=async()=>UNAVAILABLE_SYNDICATION_CHANNELS;`], ['src/services/websiteListingPublicationService.js', `${request}export const getWebsiteListingPublicationStatus=id=>request('website-status',{id});export const setWebsiteListingPublication=async()=>{throw new Error('Use fixture publication queue')};`]]);
  if (realRentalDetail) {
    modules.set('src/services/rentals/rentalListingChannelService.js', `export const loadRentalListingChannels=async()=>({activity:[],errors:{}});export const recordRentalPublicationEvent=async()=>({id:'fixture-event'});export const runRentalPublicationAction=async()=>{throw new Error('Direct provider calls are disabled in this fixture')};export const getRentalPortalStatus=async()=>({});export const reconcileRentalPortalPublication=async()=>({});export const updateRentalPortalStatus=async()=>({});`);
    modules.set('src/services/rentals/rentalListingOverviewService.js', `import{buildRentalListingOverview}from'/src/services/rentals/rentalListingOverviewModel.js';export const loadRentalListingOverview=async listing=>buildRentalListingOverview({listing});`);
  }
  if (saleSource) modules.set('src/pages/AgentListings.jsx', saleSource);
  const entry = `import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route,useParams,Link}from'react-router-dom';import Sale from'/src/pages/AgentListings.jsx';import Rental from'/src/pages/rentals/RentalListingCreatePage.jsx';${realRentalDetail ? "import RentalDetail from'/src/pages/rentals/RentalListingDetailPage.jsx';" : ''}import ListingPublicationProgress from'/src/components/listings/ListingPublicationProgress.jsx';import{refreshListingPublicationResults,retryFailedListingChannels}from'/src/services/listings/listingInitialPublicationService.js';import'/src/index.css';function Saved(){let{listingId}=useParams();const[row,setRow]=React.useState(null),[results,setResults]=React.useState([]);React.useEffect(()=>{fetch('/fixture/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:listingId})}).then(r=>r.json()).then(r=>setRow(r.data));refreshListingPublicationResults(listingId).then(setResults)},[listingId]);return <main><h1>Fixture saved record</h1><p>This receipt viewer replaces the full detail page; editor and save services above are real.</p>{row && <Link to={row.listingCategory==='rental'?'/agent/rentals/listings/'+listingId+'/edit?step=property':'/listings/'+listingId+'/edit?scope=property'}>Reopen editor</Link>}<ListingPublicationProgress results={results} onCheckStatus={()=>refreshListingPublicationResults(listingId).then(setResults)} onRetry={()=>retryFailedListingChannels({listingId,listingStatus:'active',channels:['property24','private_property','agency_website'],requestKey:crypto.randomUUID()}).then(()=>refreshListingPublicationResults(listingId)).then(setResults)}/><pre>{JSON.stringify(row,null,2)}</pre></main>}createRoot(document.getElementById('root')).render(<BrowserRouter><div style={{padding:8,background:'#fff3ce'}}>Local diagnostic. Simulated account/storage/portal. Rental updates execute real local SQL.</div>${navigationChecks ? "<nav><Link to='/listings/new'>Open sales capture</Link><Link to='/agent/rentals/listings/new'>Open rental capture</Link><Link to='/agent/diagnostic-away'>Leave capture</Link></nav>" : ''}<Routes><Route path='/listings/new' element={<Sale/>}/><Route path='/mobile/listings/new' element={<Sale mobileEditor/>}/><Route path='/listings/:listingId/edit' element={<Sale/>}/><Route path='/agent/rentals/listings/new' element={<Rental/>}/><Route path='/agent/rentals/listings/:listingId/edit' element={<Rental/>}/><Route path='/agent/listings/:listingId' element={<Saved/>}/><Route path='/agent/rentals/listings/:listingId/:detailTab' element={${realRentalDetail ? '<RentalDetail/>' : '<Saved/>'}}/></Routes></BrowserRouter>);`;
  const send = (res, data, error = null) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      data,
      error
    }));
  };
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'arch9-listing-diagnostic-'));
  const server = await createServer({
    root,
    configFile: false,
    envDir: false,
    // Avoid thousands of unbundled icon requests in each fresh browser context.
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
    cacheDir,
    plugins: [react({ exclude: [/node_modules/, /\/deps\//] }), {
      name: 'matrix-fixture',
      enforce: 'pre',
      resolveId(id) {
        if (id === '/diagnostic.jsx') return root + '/diagnostic.jsx';
      },
      load(id) {
        if (id === root + '/diagnostic.jsx') return entry;
        return modules.get(path.relative(root, id));
      },
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          try {
            if (req.url === '/fixture/blank' && req.method === 'GET') {
              res.setHeader('Content-Type', 'text/html');
              res.end('<!doctype html><title>Local diagnostic seed</title>');
              return;
            }
            if (req.url?.startsWith('/fixture/photo.png')) {
              res.setHeader('Content-Type', 'image/png');
              res.end(await readFile(root + '/public/demo-listing-images/revo-sales-cover.png'));
              return;
            }
            if (req.url?.startsWith('/fixture/') && req.method === 'POST') {
              let body = '';
              for await (const c of req) body += c;
              send(res, await action(req.url.slice(9), JSON.parse(body || '{}')));
              return;
            }
            if (req.url === '/api/listings/publication-jobs' && req.method === 'POST') {
              let body = '';
              for await (const c of req) body += c;
              const b = JSON.parse(body);
              events.push({
                kind: 'queue',
                body: b
              });
              let rows = b.channels.map(channel => ({
                id: randomUUID(),
                listing_id: b.listingId,
                channel,
                state: failure === channel ? 'failed' : ['uncertain', 'queue-response'].includes(failure) ? 'uncertain' : 'accepted',
                message: 'Local simulated provider receipt',
                update_request_key: b.requestKey
              }));
              jobs.set(b.listingId, [...(jobs.get(b.listingId) || []).filter(row => !b.channels.includes(row.channel)), ...rows]);
              if (failure === 'queue-response') {
                failure = ''; res.statusCode = 503; send(res, null, 'Simulated lost publishing response'); return;
              }
              await writeFile(out + '/events.json', JSON.stringify(events, null, 2));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                jobs: rows
              }));
              return;
            }
            if (req.url?.startsWith('/listings/') || req.url?.startsWith('/mobile/listings/') || req.url?.startsWith('/agent/')) {
              res.setHeader('Content-Type', 'text/html');
              res.setHeader('Content-Security-Policy', "connect-src 'self' ws://127.0.0.1:4241;img-src 'self' https://fixture.invalid data: blob:;");
              res.end(await s.transformIndexHtml('/', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Listing category diagnostic</title></head><body><div id="root"></div><script type="module" src="/diagnostic.jsx"></script></body></html>`));
              return;
            }
            next();
          } catch (e) {
            console.error('Diagnostic request failed:', req.url, e.message);
            send(res, null, {
              message: e.message,
              code: e.code
            });
          }
        });
      }
    }],
    server: {
      host: '127.0.0.1',
      port: 4241,
      strictPort: true
    }
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    await db.close();
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }
  return {
    origin,
    actor,
    org,
    events,
    setPortfolioSize: count => { portfolio = Array.from({ length: count }, () => ({ id: randomUUID(), listingCategory: 'private_sale', listingStatus: 'active', propertyCategory: 'residential', title: 'Synthetic portfolio property' })); },
    close: async () => {
      await server.close();
      await db.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  };
}
