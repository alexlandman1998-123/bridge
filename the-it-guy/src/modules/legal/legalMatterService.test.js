import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLegalMatterService } from './legalMatterService.js';
test('commands keep the caller request identity and revision; reads use only Legal RPCs', async () => {
  const calls=[]; const service=createLegalMatterService({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}});
  const firmId=randomUUID(), requestId=randomUUID(), matterId=randomUUID();
  const command={firmId,requestId,action:'update_matter',payload:{matter_id:matterId,expected_revision:3,title:'Will'}};
  await service.command(command); await service.command(command);
  assert.deepEqual(calls[0],calls[1]); assert.equal(calls[0].args.p_payload.expected_revision,3);
  await service.context(firmId); await service.matter(firmId,matterId); await service.register(firmId,{scope:'mine',page_size:10}); await service.clients(firmId);
  assert.ok(calls.every(c=>['arch9_legal_command','arch9_legal_read'].includes(c.name)));
  assert.throws(()=>service.command({...command,requestId:undefined}),/stable request/);
  assert.throws(()=>service.command({...command,payload:{matter_id:matterId}}),/current revision/);
  assert.throws(()=>service.command({...command,action:'delete_transaction'}),/Unsupported/);
});
test('access and database errors propagate without fallback or automatic retry', async () => {
  const error={code:'42501',message:'Denied'}; let attempts=0;
  const service=createLegalMatterService({rpc:async()=>{attempts++;return {data:null,error};}});
  await assert.rejects(()=>service.context(randomUUID()),e=>e===error); assert.equal(attempts,1);
  await assert.rejects(()=>createLegalMatterService({rpc:async()=>({data:null})}).context(randomUUID()),/no result/);
});
