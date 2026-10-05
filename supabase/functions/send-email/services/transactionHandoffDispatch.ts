import { createClient } from 'supabase';

export async function transactionHandoffManagedByWorker(transactionId: string, client?: any, role?: string) {
  if (!transactionId) return false;
  const db = client || createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await db.rpc('bridge_transaction_handoff_dispatch_mode',{p_transaction_id:transactionId});
  if (error) {
    if (['42883','PGRST202'].includes(error.code)) return false;
    throw new Error('Unable to confirm handoff delivery mode');
  }
  if (typeof data?.enabled !== 'boolean') throw new Error('Invalid handoff delivery mode');
  return data.enabled && (!role || Array.isArray(data.managedRoles) && data.managedRoles.includes(role));
}
