import { handleImapSetup } from './handleImapSetup.ts';
import { handleInboxAttachment } from './handleInboxAttachment.ts';
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', channel='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actor='11111111-1111-4111-8111-111111111111';
function equal(actual:unknown,expected:unknown) { if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`); }
const request=(body:unknown,token='user-jwt')=>new Request('http://localhost/test',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
function fixture({allowed=true,signedIn=true,state='available'}={}) {
  const calls:Record<string,unknown>[]=[];let downloads=0;
  const db={auth:{getUser:(token:string)=>Promise.resolve({data:{user:signedIn?{id:actor}:null},error:token==='user-jwt'?null:{message:'invalid'}})},
    rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return Promise.resolve({data:name==='shared_inbox_authorize_mailbox_user'?allowed:{status:'authorizing',connectionId:'connection'},error:null});},
    from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:()=>Promise.resolve({data:{organisation_id:org,channel_id:channel,filename:'Offer\r\nX-Evil: true.pdf',state,object_path:'private-path'},error:null})};return query;},
    storage:{from:()=>({download:()=>{downloads++;return Promise.resolve({data:new Blob(['private file']),error:null});}})}};
  return {db,calls,get downloads(){return downloads;}};
}
Deno.test('IMAP handler authorizes the mailbox and stores credentials without echoing secrets',async()=>{
 const f=fixture();const response=await handleImapSetup(request({organisationId:org,channelId:channel,host:'IMAP.Example.Test',username:'mail@example.test',password:'never-echo'}),()=>f.db);
 equal(response.status,202);const result=await response.text();if(result.includes('never-echo'))throw Error('Credential exposed');
 const saved=f.calls.find(call=>call.name==='shared_inbox_configure_imap')?.args as Record<string,unknown>;
 equal(saved.p_actor,actor);equal(saved.p_credential,{host:'imap.example.test',port:993,username:'mail@example.test',password:'never-echo'});
});
Deno.test('IMAP handler denies viewers, unauthenticated requests, and cleartext ports',async()=>{
 for(const opts of [{allowed:false},{signedIn:false}]){const f=fixture(opts);equal((await handleImapSetup(request({organisationId:org,channelId:channel,password:'secret'}),()=>f.db)).status,400);equal(f.calls.some(call=>call.name==='shared_inbox_configure_imap'),false);}
 const f=fixture();equal((await handleImapSetup(request({organisationId:org,channelId:channel,port:143}),()=>f.db)).status,400);
});
Deno.test('attachment handler checks current read access before downloading private bytes',async()=>{
 const f=fixture();const response=await handleInboxAttachment(request({organisationId:org,attachmentId:'file'}),()=>f.db);
 equal(response.status,200);equal(f.downloads,1);equal(response.headers.get('content-type'),'application/octet-stream');equal(response.headers.get('x-content-type-options'),'nosniff');equal(response.headers.get('cache-control'),'no-store');
 if(response.headers.get('content-disposition')?.includes('\r\n'))throw Error('Unsafe filename header');
 equal((f.calls[0].args as Record<string,unknown>).p_permission,'read');equal(await response.text(),'private file');
});
Deno.test('revoked access and oversized attachments never reach storage',async()=>{
 for(const opts of [{allowed:false},{signedIn:false},{state:'too_large'}]) {const f=fixture(opts);const response=await handleInboxAttachment(request({organisationId:org,attachmentId:'file'}),()=>f.db);equal(response.status,404);equal(f.downloads,0);if((await response.text()).includes('private-path'))throw Error('Storage path exposed');}
});
