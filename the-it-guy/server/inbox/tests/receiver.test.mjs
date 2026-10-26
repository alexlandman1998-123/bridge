import test from 'node:test'
import assert from 'node:assert/strict'
import { receiveOne, accessToken } from '../receiver.mjs'
import { publicAddress, pinnedHost, imapProvider } from '../providers/imap.mjs'
import { googleProvider } from '../providers/google.mjs'
import { microsoftProvider } from '../providers/microsoft.mjs'
import { api, ReceiveError, FILE_LIMIT } from '../common.mjs'
const json = body => new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})
const connection = { id:'connection', organisation_id:'org', channel_id:'channel', mailbox_address:'mail@example.test',provider_key:'google_workspace', initial_history_days:30 }
function fakeDb({ failCommit, uploadError, failRenew } = {}) {
  const job = { connection, token:'lease', runId:'run', checkpoint:{} }, calls=[], uploads=[]
  let committed = 0
  return { job,calls,uploads,
    async rpc(name,args) {
      calls.push({name,args:structuredClone(args)})
      if(name==='shared_inbox_claim_mailbox') return {data:structuredClone(job)}
      if(name==='revo_read_inbox_connection_credential') return {data:{password:'never-log-secret'}}
      if(name==='shared_inbox_renew_mailbox' && failRenew) return {error:{message:'mailbox_lease_lost'}}
      if(name==='shared_inbox_commit_received') {
        if(args.p_message && ++committed===failCommit) return {error:{message:'DB is offline'}}
        job.checkpoint=structuredClone(args.p_checkpoint)
      }
      return {data:true}
    },
    storage:{from:()=>({upload:async(path,bytes)=>{uploads.push({path,bytes});return {error:uploadError}}})},
  }
}
const message = id => ({ providerId:id,bodyText:'Full email',attachments:[] })
const factory = (read = async id=>message(id)) => async()=>({plan:async()=>({refs:['one','two','three'],next:{last:3},more:false}),read,close:async()=>{}})
test('partial imports resume the exact unfinished page and never duplicate an earlier message',async()=>{
  const db=fakeDb({failCommit:2}), logs=[], read=[]
  await receiveOne(db,{providerFactory:factory(async id=>{read.push(id);return message(id)}),log:v=>logs.push(v)})
  assert.deepEqual(db.job.checkpoint.pending,['two','three'])
  assert.deepEqual(read,['one','two'])
  read.length=0
  await receiveOne(db,{providerFactory:factory(async id=>{read.push(id);return message(id)}),log:v=>logs.push(v)})
  assert.deepEqual(read,['two','three']);assert.deepEqual(db.job.checkpoint,{cursor:{last:3},pending:[],more:false})
  assert(!logs.join('').includes('never-log-secret'))
})
test('attachment upload failure preserves the current message position',async()=>{
  const db=fakeDb({uploadError:{statusCode:'503'}})
  await receiveOne(db,{providerFactory:factory(async id=>({...message(id),attachments:[{id:'a',filename:'offer.pdf',size:3,state:'available',load:async()=>Buffer.from('pdf')}]})),log:()=>{}})
  assert.deepEqual(db.job.checkpoint.pending,['one','two','three'])
  assert.equal(db.calls.find(c=>c.name==='shared_inbox_finish_mailbox').args.p_error,'attachment_storage_failed')
})
test('deterministic uploads can be replayed; oversized files have metadata without file bytes',async()=>{
  const db=fakeDb({uploadError:{statusCode:'409'}})
  await receiveOne(db,{providerFactory:factory(async id=>({...message(id),attachments:[{id:'big',filename:'large.pdf',size:FILE_LIMIT+1,state:'available',load:async()=>assert.fail('large file fetched')},{id:'small',filename:'../../private.pdf',size:3,state:'available',load:async()=>Buffer.from('pdf')}]})),log:()=>{}})
  const writes=db.calls.filter(c=>c.name==='shared_inbox_commit_received'&&c.args.p_message)
  assert.equal(writes.length,3);assert.equal(writes[0].args.p_message.attachments[0].state,'too_large')
  assert(!db.uploads[0].path.includes('private.pdf'));assert.match(db.uploads[0].path,/^org\/channel\/[a-f0-9]{64}\/[a-f0-9]{64}$/)
})
test('lost lease prevents provider reads, uploads and commits',async()=>{
  const db=fakeDb({failRenew:true});let reads=0
  await receiveOne(db,{providerFactory:factory(async()=>{reads++;return message('one')}),log:()=>{}})
  assert.equal(reads,0);assert.equal(db.uploads.length,0)
  assert.equal(db.calls.filter(c=>c.name==='shared_inbox_commit_received'&&c.args.p_message).length,0)
})
test('one failed mailbox does not prevent the next receiving run',async()=>{
  const db=fakeDb();let count=0
  const open=async()=>{if(++count===1)throw new Error('secret-password');return (await factory()())}
  const logs=[];await receiveOne(db,{providerFactory:open,log:v=>logs.push(v)});await receiveOne(db,{providerFactory:open,log:v=>logs.push(v)})
  assert.equal(JSON.parse(logs[0]).status,'failed');assert.equal(JSON.parse(logs[1]).status,'completed');assert(!logs.join('').includes('secret-password'))
})
test('OAuth refresh preserves refresh tokens and stores absolute expiry under the lease',async()=>{
  let rotated
  const result=await accessToken(connection,{refresh_token:'keep'},value=>{rotated=value},{env:{REVO_GOOGLE_CLIENT_ID:'id',REVO_GOOGLE_CLIENT_SECRET:'secret'},fetcher:async()=>json({access_token:'new',expires_in:3600})})
  assert.equal(result,'new');assert.equal(rotated.refresh_token,'keep');assert(rotated.expires_at>Date.now())
  await assert.rejects(()=>accessToken(connection,{refresh_token:'old'},()=>{}, {env:{REVO_GOOGLE_CLIENT_ID:'id',REVO_GOOGLE_CLIENT_SECRET:'secret'},fetcher:async()=>new Response('{"error":"invalid_grant"}',{status:400})}),/oauth_access_revoked/)
})
test('DNS/IP SSRF protection blocks all non-public addresses and mixed DNS answers',async()=>{
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.1.2','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) assert.equal(publicAddress(address),false,address)
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true)
  await assert.rejects(()=>pinnedHost('imap.example.test',async()=>[{address:'8.8.8.8'},{address:'10.0.0.1'}]),/imap_host_blocked/)
  assert.equal(await pinnedHost('imap.example.test',async()=>[{address:'8.8.8.8'}]),'8.8.8.8')
})
test('IMAP pins DNS, verifies TLS and opens read-only; UID gaps and validity reset are bounded',async()=>{
  let options, opened, search
  class Client {
    constructor(value){options=value;this.mailbox={uidValidity:42n,uidNext:2010}}
    on(){}async connect(){}async getMailboxLock(name,opts){opened={name,opts};return {release(){}}}
    async search(query){search=query;return [1,5,8,12,20,21,22,23,24,25,26,27]}
    async logout(){}
  }
  const provider=await imapProvider({...connection,provider_key:'other_email'},{host:'imap.example.test',port:993,username:'me',password:'secret'},{Client,resolver:async()=>[{address:'8.8.8.8'}]})
  assert.equal(options.host,'8.8.8.8');assert.equal(options.servername,'imap.example.test');assert.equal(options.secure,true);assert.equal(options.tls.rejectUnauthorized,true)
  assert.deepEqual(opened,{name:'INBOX',opts:{readOnly:true}})
  const page=await provider.plan({validity:'41',last:9999})
  assert.equal(search.uid,'1:1000');assert.equal(page.refs.length,10);assert.equal(page.next.last,25);assert.equal(page.more,true)
  await assert.rejects(()=>provider.read({uid:1,validity:'41'}),/imap_uidvalidity_changed/)
  await provider.close()
})
test('Google snapshots history before initial pages and resumes expired history safely',async()=>{
  const urls=[]
  const provider=googleProvider(connection,'token',async url=>{
    urls.push(String(url))
    if(url.pathname.endsWith('/profile'))return json({emailAddress:connection.mailbox_address,historyId:'100'})
    if(url.pathname.endsWith('/history'))return new Response('{}',{status:404})
    return json({messages:[{id:'one'}],nextPageToken:'next'})
  })
  const page=await provider.plan({mode:'history',historyId:'expired'})
  assert.equal(page.next.historyId,'100');assert.equal(page.next.page,'next');assert(page.more)
  assert(urls[1].endsWith('/profile'));assert(urls[2].includes('after%3A'))
})
test('Google imports full MIME bodies, charset, named recipients and attachment metadata',async()=>{
  const provider=googleProvider(connection,'token',async()=>json({id:'one',threadId:'thread',internalDate:'1792929600000',labelIds:['INBOX','UNREAD'],payload:{headers:[{name:'From',value:'Client <client@example.test>'},{name:'To',value:'Sales Team <mail@example.test>'},{name:'Message-ID',value:'<one@example>'}],parts:[{mimeType:'text/plain',headers:[{name:'Content-Type',value:'text/plain; charset=iso-8859-1'}],body:{data:Buffer.from([99,97,102,233]).toString('base64url'),size:4}},{mimeType:'application/pdf',filename:'offer.pdf',body:{size:FILE_LIMIT+1,attachmentId:'large'}}]}}))
  const value=await provider.read('one')
  assert.equal(value.bodyText,'café');assert.equal(value.to[0],'mail@example.test');assert.equal(value.senderAddress,'client@example.test');assert.equal(value.attachments[0].state,'too_large');assert.equal(value.isRead,false)
})
test('provider continuation URLs cannot exfiltrate credentials and honor Retry-After',async()=>{
  let calls=0;const request=api('secret','https://graph.microsoft.com',async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'120'}})},'/v1.0/me/')
  await assert.rejects(()=>request('https://evil.example/v1.0/me/messages'),/provider_continuation_invalid/)
  await assert.rejects(()=>request('https://graph.microsoft.com/v1.0/users/other/messages'),/provider_continuation_invalid/)
  assert.equal(calls,0)
  await assert.rejects(()=>request('/v1.0/me/messages'),error=>error instanceof ReceiveError && error.retrySeconds===120)
})
test('Microsoft follows delta pages and retains unsupported and inline attachment metadata',async()=>{
  const provider=microsoftProvider({...connection,provider_key:'microsoft_365'},'token',async url=>{
    if(url.pathname.endsWith('/delta'))return json({value:[{id:'one'},{id:'gone','@removed':{}}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?next=2'})
    if(url.pathname.endsWith('/attachments'))return json({value:[{'@odata.type':'#microsoft.graph.referenceAttachment',id:'link',name:'cloud file',size:5},{'@odata.type':'#microsoft.graph.fileAttachment',id:'inline',name:'logo.png',size:6,isInline:true}]})
    return json({id:'one',conversationId:'thread',internetMessageId:'<one>',receivedDateTime:'2026-10-25T12:00:00Z',from:{emailAddress:{address:'client@example.test'}},toRecipients:[{emailAddress:{address:'mail@example.test'}}],body:{contentType:'html',content:'<p>Full content</p>'},isRead:true})
  })
  const page=await provider.plan();assert.deepEqual(page.refs,['one']);assert(page.more)
  const value=await provider.read('one');assert.equal(value.bodyHtml,'<p>Full content</p>');assert.equal(value.attachments[0].state,'unsupported');assert(value.attachments[1].isInline)
})
test('expired Microsoft delta state replays the initial inbox instead of looping on initial failures',async()=>{
 const paths=[]
 const provider=microsoftProvider({...connection,provider_key:'microsoft_365'},'token',async url=>{
  paths.push(String(url))
  if(url.searchParams.has('expired')) return new Response('{}',{status:410})
  return json({value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?fresh=1'})
 })
 const page=await provider.plan({url:'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?expired=1'})
 assert.equal(paths.length,2);assert.match(page.next.url,/fresh=1/)
 const missing=microsoftProvider(connection,'token',async()=>new Response('{}',{status:404}))
 await assert.rejects(()=>missing.plan(),/provider_unavailable/)
})
test('provider account identity mismatch is rejected before Microsoft imports',async()=>{
 const provider=microsoftProvider(connection,'token',async()=>json({mail:'other@example.test',userPrincipalName:'other@example.test'}))
 await assert.rejects(()=>provider.verify(),/mailbox_identity_mismatch/)
})
test('an unfinished IMAP page is discarded after UIDVALIDITY changes',async()=>{
 const db=fakeDb();db.job.checkpoint={cursor:{validity:'old',last:99},pending:[{uid:100,validity:'old'}],next:{validity:'old',last:100}}
 let planned, read
 await receiveOne(db,{providerFactory:async()=>({validity:'new',plan:async cursor=>{planned=cursor;return {refs:[{uid:1,validity:'new'}],next:{validity:'new',last:1},more:false}},read:async ref=>{read=ref;return message('new:1')},close:async()=>{}}),log:()=>{}})
 assert.equal(planned,undefined);assert.deepEqual(read,{uid:1,validity:'new'});assert.equal(db.job.checkpoint.cursor.validity,'new')
})
