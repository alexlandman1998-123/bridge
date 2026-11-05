import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js',()=>({isSupabaseConfigured:false,supabase:null}))
import { getTransactionWorkflowReadModel } from '../transactionWorkflowReadModelService.js'
import { getTransactionSyncReadModel } from '../transactionSyncReadModelService.js'
afterEach(()=>vi.restoreAllMocks())
function clientFixture(){
 const tables=[]
 const transaction={id:'matter',organisation_id:'org',stage:'OTP',current_main_stage:'OTP',finance_type:'cash',purchase_price:100}
 const client={rpc:vi.fn(async()=>({data:[],error:null})),from(table){tables.push(table)
  const data=table==='transactions'?transaction:[]
  const chain=new Proxy({}, {get(_target,key){
   if(key==='then')return resolve=>Promise.resolve({data,error:null}).then(resolve)
   if(['maybeSingle','single'].includes(key))return async()=>({data,error:null})
   return ()=>chain
  }})
  return chain
 }}
 return {client,tables}
}
it.each(['buyer','seller'])('keeps %s workflow reads within portal-readable stores',async viewerRole=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{})
 const {client,tables}=clientFixture()
 const result=await getTransactionWorkflowReadModel('matter',{client,viewerRole,canViewPrivate:false})
 expect(result.transaction.id).toBe('matter')
 expect(tables).toContain('transaction_subprocesses')
 expect(tables).not.toContain('transaction_participant_requirements')
 expect(tables).not.toContain('notification_events')
 expect(tables).not.toContain('transaction_refresh_signals')
})
it('retains professional refresh metadata for professional workspaces',async()=>{
 const {client,tables}=clientFixture()
 await getTransactionSyncReadModel('matter',{client,viewerRole:'attorney'})
 expect(tables).toContain('transaction_refresh_signals')
})
