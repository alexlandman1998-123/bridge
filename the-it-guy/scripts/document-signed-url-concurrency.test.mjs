import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/domains/documents/listReadApi.js',import.meta.url),'utf8')
const start=source.indexOf('async function enrichDocuments(')
const end=source.indexOf('\nexport function normalizeSharedDocumentRow',start)
let active=0,peak=0,calls=0
const enrich=Function('getSignedUrl','isCanonicalFinalSignedDocumentRow','toClientPortalFinalSignedDocumentDescriptor',source.slice(start,end)+';return enrichDocuments')(
 async path=>{active++;calls++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,path==='file-0'?10:1));active--;return 'signed:'+path},
 d=>d.final===true,d=>({...d,descriptor:true}))
const rows=Array.from({length:11},(_,i)=>({id:i,file_path:'file-'+i}))
const result=await enrich(rows)
assert.equal(peak,3);assert.equal(calls,11)
assert.deepEqual(result.map(d=>d.id),rows.map(d=>d.id))
assert.equal(result[0].url,'signed:file-0')
const descriptor=await enrich([{id:12,final:true}],{clientPortalFinalArtifactDescriptors:true})
assert.equal(calls,11);assert.equal(descriptor[0].descriptor,true)
assert.deepEqual(await enrich([]),[])
console.log('Signed URL requests are bounded to three; order and final portal descriptors are preserved.')
