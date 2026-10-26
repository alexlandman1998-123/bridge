import { inboxSendingHandler } from './inboxSendingHandlers.ts';
import { normalizeOutgoing,outgoingBody } from './inboxOutgoing.js';
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',channel='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`Expected ${JSON.stringify(b)}; got ${JSON.stringify(a)}`)};
const request=(body:unknown)=>new Request('http://localhost/send',{method:'POST',headers:{authorization:'Bearer user-jwt','content-type':'application/json'},body:JSON.stringify(body)});
function fixture({allowed=true,signedIn=true,revision=3}={}){
 const calls:any[]=[],files:any[]=[];
 const db={auth:{getUser:()=>Promise.resolve({data:{user:signedIn?{id:actor}:null},error:null})},
 rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='shared_inbox_authorize_mailbox_user'?allowed:name==='shared_inbox_queue_email'?{id:'job',status:'queued',conversationId:'thread'}:true,error:null}},
 from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{signature_json:{name:'Mailbox Signature',body:[]},revision},error:null})};return query},
 storage:{from:()=>({upload:async(path:string,file:File)=>{files.push({path,file});return {error:null}}})}};
 return {db,calls,files};
}
Deno.test('outgoing validation blocks header injection and appends exactly one safe signature',()=>{
 for(const input of[{to:'client@example.test\r\nBcc: stolen@example.test',subject:'Subject',body:'Body'},{to:'client@example.test',subject:'Subject\nBcc: stolen',body:'Body'}]){let rejected=false;try{normalizeOutgoing(input)}catch{rejected=true}equal(rejected,true)}
 const email=normalizeOutgoing({to:'client@example.test',body:'<script>alert(1)</script>',subject:'Subject',useSignature:true});const rendered=outgoingBody(email,{name:'Safe <name>',body:[]});
 equal(rendered.html.includes('<script>'),false);equal(rendered.html.includes('&lt;script&gt;'),true);equal(rendered.text.split('Safe <name>').length,2);
});
Deno.test('send handler binds the session actor and server mailbox signature, ignoring forged From and HTML',async()=>{
 const f=fixture();const response=await inboxSendingHandler('send',()=>f.db)(request({organisationId:org,channelId:channel,requestId,actorUserId:'forged',email:{to:['client@example.test'],cc:[],bcc:['hidden@example.test'],subject:'Review',body:'Body <safe>',useSignature:true,signatureRevision:3,from:'forged@example.test',html:'<script>bad</script>'}}));
 equal(response.status,202);const saved=f.calls.find(row=>row.name==='shared_inbox_queue_email').args;
 equal(saved.p_actor,actor);equal(saved.p_payload.from,undefined);equal(saved.p_rendered.html.includes('<script>'),false);equal(saved.p_rendered.text,'Body <safe>\n\n-- \nMailbox Signature');equal((await response.json()).status,'queued');
});
Deno.test('send handler denies viewers, invalid sessions and stale signature previews',async()=>{
 for(const options of[{allowed:false},{signedIn:false},{revision:9}]){
  const f=fixture(options);const response=await inboxSendingHandler('send',()=>f.db)(request({organisationId:org,channelId:channel,requestId,email:{to:'client@example.test',subject:'Subject',body:'Body',useSignature:true,signatureRevision:3}}));
  equal(response.status,options.signedIn===false?401:400);equal(f.calls.some(row=>row.name==='shared_inbox_queue_email'),false);
 }
});
Deno.test('SMTP credentials are manager-only and never echoed in the response',async()=>{
 const f=fixture();const response=await inboxSendingHandler('smtp',()=>f.db)(request({organisationId:org,channelId:channel,host:'SMTP.Example.Test',port:587,username:'mail@example.test',password:'private-password'}));
 equal(response.status,200);equal((f.calls[0].args as any).p_permission,'manage');equal(f.calls[1].args.p_secret.port,587);equal((await response.text()).includes('private-password'),false);
 const denied=fixture({allowed:false});await inboxSendingHandler('smtp',()=>denied.db)(request({organisationId:org,channelId:channel,password:'secret'}));equal(denied.calls.some(row=>row.name==='shared_inbox_configure_smtp'),false);
});
Deno.test('attachment upload uses a server-generated mailbox path and registers actor ownership',async()=>{
 const f=fixture();const form=new FormData();form.set('organisationId',org);form.set('channelId',channel);form.set('file',new File(['private file'],'../../offer.pdf',{type:'application/pdf'}));
 const response=await inboxSendingHandler('upload',()=>f.db)(new Request('http://localhost/upload',{method:'POST',headers:{authorization:'Bearer user-jwt'},body:form}));
 equal(response.status,201);const result=await response.json();equal(f.files[0].path,`${org}/${channel}/outgoing/${result.id}`);equal(result.object_path,undefined);equal(f.calls.find(row=>row.name==='shared_inbox_register_outgoing_file').args.p_actor,actor);
});
Deno.test('oversized request bodies are rejected before allocating an entire upload',async()=>{
 const f=fixture();const response=await inboxSendingHandler('upload',()=>f.db)(new Request('http://localhost/upload',{method:'POST',headers:{authorization:'Bearer user-jwt','content-length':'999999999'},body:'small'}));equal(response.status,413);equal(f.files.length,0);
 const large=await inboxSendingHandler('send',()=>f.db)(request({organisationId:org,channelId:channel,message:'x'.repeat(200000)}));equal(large.status,400);equal(f.calls.some(row=>row.name==='shared_inbox_queue_email'),false);
});
