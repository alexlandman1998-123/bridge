import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=readFileSync('src/lib/api.js','utf8')
const start=source.indexOf('async function getSignedUrl(')
const end=source.indexOf('\nexport async function createTransactionDocumentSignedUrl',start)
const build=new Function('requireClient','DOCUMENTS_BUCKET_CANDIDATES','isStorageBucketNotFoundError',`${source.slice(start,end)};return getSignedUrl`)
let publicCalls=0
const client={storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'Object not found'}}),getPublicUrl:()=>{publicCalls++;return {data:{publicUrl:'invalid-public-url'}}}})}}
const getUrl=build(()=>client,['documents'],()=>false)
assert.equal(await getUrl('missing.pdf'),null)
assert.equal(publicCalls,0,'Signing failure must not be disguised as a public URL')
client.storage.from=()=>({createSignedUrl:async()=>({data:{signedUrl:'signed-url'},error:null})})
assert.equal(await getUrl('present.pdf'),'signed-url')
console.log('PASS: signing failures stay unavailable; valid signed URLs retained')
