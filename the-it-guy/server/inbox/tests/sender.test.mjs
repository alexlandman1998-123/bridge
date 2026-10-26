import test from 'node:test'
import assert from 'node:assert/strict'
import {simpleParser} from 'mailparser'
import {buildOutgoingMime,sendOne,smtpOperation,smtpTransport,submitOutgoing,verifySender} from '../sender.mjs'
import {normalizeOutgoing,outgoingBody} from '../../../../supabase/functions/_shared/inboxOutgoing.js'
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}})
const payload=normalizeOutgoing({to:['to@example.test'],cc:['cc@example.test'],bcc:['hidden@example.test'],subject:'Hello',body:'Body <safe>',useSignature:true})
const job={id:'job',created_at:'2026-10-25T12:00:00Z',payload_json:payload,rendered_json:outgoingBody(payload,{name:'Sender One',body:[]})}
const connection={id:'connection',provider_key:'google_workspace',mailbox_address:'sender@example.test',connection_kind:'individual_mailbox'}
const prepared={sender:'sender@example.test',message:{internetMessageId:'<stable@example.test>',inReplyTo:'<parent@example.test>',references:['<root@example.test>','<parent@example.test>'],threadId:'thread'},credential:{access_token:'local-token',expires_at:Date.now()+3600000},attachments:[]}
function dbFixture({beginError=false,receiptError=false,provider='google_workspace'}={}){
 const calls=[]
 return {calls,storage:{from:()=>({download:async()=>({data:new Blob(['file'])})})},rpc:async(name,args)=>{
  calls.push({name,args})
  if(name==='shared_inbox_claim_outgoing')return {data:{job,connection:{...connection,provider_key:provider},token:'token'}}
  if(name==='shared_inbox_prepare_outgoing')return {data:{...prepared,smtp:{host:'smtp.example.test',port:465,username:'me',password:'never-log-this'}}}
  if(name==='shared_inbox_begin_submission'&&beginError)return {error:{message:'outgoing_lease_lost'}}
  if(name==='shared_inbox_finish_outgoing'&&receiptError)return {error:{message:'temporary database failure'}}
  return {data:true}
 }}
}
test('MIME preserves reply headers, stable identity, Unicode, safe HTML and binary files; SMTP Bcc stays out of headers',async()=>{
 const mail=await buildOutgoingMime(job,prepared,[{filename:'offer.pdf',content:Buffer.from([0,255,1]),contentType:'application/octet-stream'}])
 const parsed=await simpleParser(mail.raw)
 assert.equal(parsed.messageId,'<stable@example.test>');assert.equal(parsed.inReplyTo,'<parent@example.test>');assert.deepEqual(parsed.references,['<root@example.test>','<parent@example.test>'])
 assert(parsed.text.includes('-- \nSender One'));assert(parsed.html.includes('Body &lt;safe&gt;'));assert.equal(parsed.from.value[0].address,prepared.sender)
 assert.equal(parsed.bcc,undefined);assert(mail.apiRaw.toString().startsWith('Bcc: hidden@example.test\r\n'));assert(mail.envelope.to.includes('hidden@example.test'))
 assert.deepEqual(parsed.attachments[0].content,Buffer.from([0,255,1]))
})
test('SMTP requires verified TLS with pinned public DNS and required STARTTLS on 587',async()=>{
 for(const port of[465,587]){
  let options
  await smtpTransport({host:'smtp.example.test',port,username:'me',password:'secret'},{resolver:async()=>[{address:'8.8.8.8'}],createTransport:value=>{options=value;return {}}})
  assert.equal(options.host,'8.8.8.8');assert.equal(options.requireTLS,true);assert.equal(options.secure,port===465);assert.equal(options.tls.servername,'smtp.example.test');assert.equal(options.tls.rejectUnauthorized,true)
 }
 await assert.rejects(()=>smtpTransport({host:'smtp.example.test',port:25}),/smtp_configuration_invalid/)
 await assert.rejects(()=>smtpTransport({host:'smtp.example.test',port:465},{resolver:async()=>[{address:'127.0.0.1'}]}),/imap_host_blocked/)
})
test('Gmail submits base64url MIME with native thread ID and records the provider receipt',async()=>{
 const db=dbFixture(),posts=[]
 await sendOne(db,{log:()=>{},fetcher:async(url,init)=>{if(init.method==='POST'){posts.push({url,body:JSON.parse(init.body)});return json({id:'gmail-id',threadId:'gmail-thread'})}return json({emailAddress:prepared.sender})}})
 assert.equal(posts.length,1);assert.equal(posts[0].body.threadId,'thread');assert.equal(posts[0].url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
 const finish=db.calls.find(c=>c.name==='shared_inbox_finish_outgoing').args
 assert.equal(finish.p_status,'accepted');assert.equal(finish.p_provider_id,'gmail-id')
 assert(db.calls.findIndex(c=>c.name==='shared_inbox_begin_submission')<db.calls.findIndex(c=>c.name==='shared_inbox_finish_outgoing'))
})
test('Microsoft accepts 202 without inventing a delivery receipt or provider message ID',async()=>{
 const mail=await buildOutgoingMime(job,prepared,[]);let request
 const result=await submitOutgoing({...connection,provider_key:'microsoft_365',connection_kind:'delegated_shared_mailbox',mailbox_address:'shared@example.test'},prepared,mail,'token',{fetcher:async(url,init)=>{request={url,init};return new Response(null,{status:202})}})
 assert.equal(result.status,'accepted');assert.equal(result.providerId,null);assert(request.url.includes('/users/shared%40example.test/sendMail'));assert.equal(request.init.headers['content-type'],'text/plain');assert(Buffer.from(request.init.body,'base64').toString().includes('Message-ID: <stable@example.test>'))
})
test('unknown provider outcomes never trigger a second submission',async()=>{
 for(const response of[()=>{throw Error('private-provider-response')},()=>new Response('server accepted but failed response',{status:500}),()=>json({})]){
  const db=dbFixture(),logs=[];let posts=0
  await sendOne(db,{log:value=>logs.push(value),fetcher:async(url,init)=>{if(init.method==='POST'){posts++;return response()}return json({emailAddress:prepared.sender})}})
  assert.equal(posts,1);assert.equal(db.calls.find(c=>c.name==='shared_inbox_finish_outgoing').args.p_status,'uncertain');assert(!logs.join('').includes('private-provider-response'))
 }
})
test('explicit HTTP rejection is failed, not an invented send success',async()=>{
 const mail=await buildOutgoingMime(job,prepared,[])
 for(const status of[400,401,403,429])assert.equal((await submitOutgoing(connection,prepared,mail,'token',{fetcher:async()=>new Response('{}',{status})})).status,'failed')
})
test('revoked leases and account mismatches prevent provider submission',async()=>{
 const db=dbFixture({beginError:true});let posts=0
 await sendOne(db,{log:()=>{},fetcher:async(url,init)=>{if(init.method==='POST'){posts++;return json({id:'bad'})}return json({emailAddress:prepared.sender})}})
 assert.equal(posts,0)
 const mismatched=dbFixture()
 await sendOne(mismatched,{log:()=>{},fetcher:async()=>json({emailAddress:'wrong@example.test'})})
 assert(!mismatched.calls.some(c=>c.name==='shared_inbox_begin_submission'))
 await assert.rejects(()=>verifySender({...connection,provider_key:'microsoft_365'},'token',async()=>json({mail:'wrong@example.test'})),/mailbox_identity_mismatch/)
})
test('lost persistence after a receipt stays uncertain and never resends the email',async()=>{
 const db=dbFixture({receiptError:true});let posts=0
 await sendOne(db,{log:()=>{},fetcher:async(url,init)=>{if(init.method==='POST'){posts++;return json({id:'receipt'})}return json({emailAddress:prepared.sender})}})
 assert.equal(posts,1);assert.equal(db.calls.filter(c=>c.name==='shared_inbox_finish_outgoing').length,2);assert(db.calls.filter(c=>c.name==='shared_inbox_finish_outgoing').every(c=>c.args.p_status==='accepted'))
})
test('SMTP records partial acceptance, explicit rejection and unknown socket failures separately',async()=>{
 const mail=await buildOutgoingMime(job,prepared,[]),smtp={...connection,provider_key:'other_email'}
 assert.deepEqual(await submitOutgoing(smtp,prepared,mail,null,{transport:{sendMail:async()=>({accepted:['one'],rejected:['two']})}}),{status:'accepted',providerId:null,rejected:1,rejectedAddresses:[]})
 for(const [failure,status]of[[{code:'EAUTH'},'failed'],[{responseCode:550},'failed'],[{code:'ETIMEDOUT'},'uncertain']]){
  const result=await submitOutgoing(smtp,prepared,mail,null,{transport:{sendMail:async()=>{throw failure}}});assert.equal(result.status,status)
 }
})
test('SMTP authentication failure before submission cannot be reported as accepted',async()=>{
 const db=dbFixture({provider:'other_email'}),logs=[];let sends=0
 await sendOne(db,{log:value=>logs.push(value),makeTransport:async()=>({verify:async()=>{throw {code:'EAUTH',message:'never-log-this'}},sendMail:async()=>{sends++},close(){}})})
 assert.equal(sends,0);assert(!db.calls.some(c=>c.name==='shared_inbox_begin_submission'));assert.equal(db.calls.find(c=>c.name==='shared_inbox_finish_outgoing').args.p_status,'failed');assert(!logs.join('').includes('never-log-this'))
})

test('an SMTP socket that never finishes is closed at the absolute operation deadline',async()=>{
 let closed=false
 await assert.rejects(()=>smtpOperation({close(){closed=true}},()=>new Promise(()=>{}),5),/smtp_timeout/)
 assert.equal(closed,true)
})
