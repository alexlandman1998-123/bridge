import { readDomainDeclarationSource } from './helpers/domainApiSource.mjs'
import { createFreshDocumentSignedUrl } from '../src/lib/documentAccess.js'
import assert from 'node:assert/strict'

const source=readDomainDeclarationSource('getSignedUrl')
const build=new Function('requireClient','DOCUMENTS_BUCKET_CANDIDATES','isStorageBucketNotFoundError','createFreshDocumentSignedUrl',`${source};return getSignedUrl`)
let publicCalls=0
const client={storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'Object not found'}}),getPublicUrl:()=>{publicCalls++;return {data:{publicUrl:'invalid-public-url'}}}})}}
const getUrl=build(()=>client,['documents'],()=>false,createFreshDocumentSignedUrl)
assert.equal(await getUrl('missing.pdf'),null)
assert.equal(publicCalls,0,'Signing failure must not be disguised as a public URL')
client.storage.from=()=>({createSignedUrl:async()=>({data:{signedUrl:'signed-url'},error:null})})
assert.equal(await getUrl('present.pdf'),'signed-url')
console.log('PASS: signing failures stay unavailable; valid signed URLs retained')
