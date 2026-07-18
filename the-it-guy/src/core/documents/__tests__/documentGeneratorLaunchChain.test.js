import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDocumentGeneratorLaunchChain } from '../documentGeneratorLaunchChain.js'

const evidence={contract:'g1-v1',packetType:'otp',currentVersion:true,editableDraft:{present:true},renderFreeze:{verified:true,freezeId:'f',fingerprint:'x'},certifiedPdf:{nativeVerified:true,transactionPersisted:true,path:'generated.pdf',sha256:'sha256'},layout:{status:'applied',placementVerified:true,fieldCount:1},dispatch:{delivered:true},signing:{signerCount:1,signedCount:1,completedSessionCount:1,requiredFieldCount:1,completedRequiredFieldCount:1},finalArtifact:{path:'signed.pdf',sha256:'a'.repeat(64),byteLength:1000},transactionPublication:{id:'p',transactionId:'t',documentId:'d',sha256:'a'.repeat(64)},surfaceCompletion:{id:'r',transactionVisible:true,clientVisible:true,canonicalSatisfied:true},delivery:{recipientCount:1,deliveredRecipientCount:1}}
test('certifies the complete A-F launch chain',()=>assert.equal(assessDocumentGeneratorLaunchChain(evidence).ready,true))
test('returns the first practical blocker',()=>{const result=assessDocumentGeneratorLaunchChain({...evidence,dispatch:{delivered:false}});assert.equal(result.firstBlocker.code,'G1_DISPATCH_NOT_DELIVERED');assert.match(result.firstBlocker.solution,/dispatch/i)})
test('detects incomplete transaction publication',()=>assert.ok(assessDocumentGeneratorLaunchChain({...evidence,transactionPublication:{}}).blockers.some((item)=>item.code==='G1_TRANSACTION_PUBLICATION_MISSING')))
