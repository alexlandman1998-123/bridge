import { verifyTransactionSellerInviteSetup } from './sellerOnboarding.ts';
const token='a'.repeat(64);
function eq(actual:unknown,expected:unknown){if(actual!==expected)throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)}
Deno.test('transaction seller recipient guard checks the exact transaction, link, token and email',async()=>{
 const client={rpc:async(name:string,args:Record<string,unknown>)=>{
  eq(name,'bridge_validate_transaction_seller_delivery');eq(args.p_transaction_id,'tx');eq(args.p_link_id,'link');eq(args.p_token,token);eq(args.p_email,'seller@example.test');
  return {data:{valid:true},error:null};
 }};
 const result=await verifyTransactionSellerInviteSetup(client,'tx','link','seller@example.test',`https://example.test/seller/transaction/${token}`);
 eq(result.ok,true);eq(result.canonicalPath,`/seller/transaction/${token}`);
});
Deno.test('transaction seller delivery fails closed on changed recipients and malformed links',async()=>{
 const client={rpc:async()=>({error:{code:'42501'},data:null})};
 eq((await verifyTransactionSellerInviteSetup(client,'tx','link','changed@example.test',`https://example.test/seller/transaction/${token}`)).ok,false);
 eq((await verifyTransactionSellerInviteSetup(client,'tx','link','seller@example.test','https://example.test/seller/onboarding/other')).ok,false);
 eq((await verifyTransactionSellerInviteSetup(null,'tx','link','seller@example.test',`https://example.test/seller/transaction/${token}`)).ok,false);
});
