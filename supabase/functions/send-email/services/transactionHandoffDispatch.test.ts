import { transactionHandoffManagedByWorker } from './transactionHandoffDispatch.ts';
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
Deno.test('Formal legacy delivery defers only to the persisted worker; errors never enable a second sender',async()=>{
  const active={rpc:async()=>({data:{enabled:true,managedRoles:['transfer_attorney']}})};
  assert(await transactionHandoffManagedByWorker('matter',active),'Registered matters must defer');
  assert(await transactionHandoffManagedByWorker('matter',active,'transfer_attorney'),'Managed legal lane must defer');
  assert(!await transactionHandoffManagedByWorker('matter',active,'bond_attorney'),'Unmanaged lane keeps its existing path');
  assert(!await transactionHandoffManagedByWorker('matter',{rpc:async()=>({error:{code:'PGRST202'}})}),'Missing migration keeps legacy compatibility');
  let rejected=false;
  try{await transactionHandoffManagedByWorker('matter',{rpc:async()=>({error:{code:'42501'}})});}catch{rejected=true;}
  assert(rejected,'Permission failures must never invoke a second sender');
});
