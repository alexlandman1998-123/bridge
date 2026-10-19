import { expect, it } from 'vitest'
import { transactionSellerDirectoryPeople } from '../transactionSellerDirectory.js'
const formData = { __bridge_transaction_seller_capture:{source:'agent_manual'}, __bridge_transaction_parties:{version:'transaction_party_profile_v1',seller:{entityType:'company',name:'Archive Pty Ltd',people:[
  {id:'contact',name:'Jamie',email:'shared@example.test',primaryContact:true,role:'authorised_representative'},
  {id:'director',name:'Sam Director',email:'shared@example.test',phone:'0111111111',role:'director'},
]}} }
it('shows saved seller people, entity names and contact details without collapsing shared email addresses',()=>{
  const people=transactionSellerDirectoryPeople({formData})
  expect(people).toHaveLength(2)
  expect(people[1]).toMatchObject({id:'director',name:'Sam Director',phone:'0111111111',company:'Archive Pty Ltd',partyRole:'director'})
})
it('does not substitute a backfill snapshot for a linked listing or an unrelated source',()=>{
  expect(transactionSellerDirectoryPeople({formData,listingId:'listing'})).toBeNull()
  expect(transactionSellerDirectoryPeople({formData:{__bridge_transaction_parties:formData.__bridge_transaction_parties}})).toBeNull()
})
it('uses seller-returned people from the same transaction capture',()=>{
 expect(transactionSellerDirectoryPeople({formData:{...formData,__bridge_transaction_seller_capture:{source:'seller_link'}}})[1]).toMatchObject({id:'director',name:'Sam Director'})
})
