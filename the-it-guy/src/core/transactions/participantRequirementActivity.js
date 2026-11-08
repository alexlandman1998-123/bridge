const key=value=>String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_')
const inactive=new Set(['removed','inactive','declined','expired','cancelled','rejected'])
const captured=new Set(['captured','assigned','complete','completed','verified','satisfied'])
export function activeCapturedRequirement(requirement, participants=[]) {
 if(inactive.has(key(requirement.status)))return false
 const id=requirement.participantId||requirement.participant_id
 if(id){
  const participant=participants.find(row=>(row.id||row.participantId||row.participant_id)===id)
  if(!participant||inactive.has(key(participant.status)))return false
  const transaction=requirement.transactionId||requirement.transaction_id
  const linkedTransaction=participant.transactionId||participant.transaction_id
  if(transaction&&linkedTransaction&&transaction!==linkedTransaction)return false
  return true
 }
 return captured.has(key(requirement.status))
}
