import './WhatsAppConversationAssignment.css'

// Number ownership and chat assignment are different: only shared numbers may
// route individual conversations to someone other than a fixed number owner.
export default function WhatsAppConversationAssignment({ workspace, conversation, busy=false, onAssign }) {
 const sender=workspace.senders?.find(row=>row.id===conversation.channel_id)
 const known=!workspace.loading&&!workspace.error&&sender&&Object.hasOwn(sender,'owner_user_id')
 const personal=known&&Boolean(sender.owner_user_id)
 const assigned=personal?sender.owner_user_id:conversation.assigned_user_id||''
 const assignees=workspace.assignees||[]
 const enabled=Boolean(known&&!personal&&workspace.canManage&&!busy)
 const name=id=>id===workspace.currentUserId?'You':assignees.find(row=>row.id===id)?.name||'Assigned agent'
 const title=personal?'Personal business number — chats stay with the number owner.':!known?'Number ownership is not available yet.':!workspace.canManage?'Agency management assigns conversations.':'Assign this chat. Replies still use the same business number.'
 return <label className="wa-header-assignment" title={title}><span>Assign to</span><select aria-label="Assign conversation to" value={known?assigned:'unknown'} disabled={!enabled} onChange={event=>{if(enabled)onAssign(event.target.value||null)}}>
  {!known?<option value="unknown">{workspace.loading?'Loading…':'Unavailable'}</option>:personal?<option value={assigned}>{name(assigned)} · Personal number</option>:<><option value="">Unassigned</option>{assigned&&!assignees.some(row=>row.id===assigned)&&<option value={assigned} disabled>{name(assigned)}</option>}{assignees.map(agent=><option key={agent.id} value={agent.id}>{agent.id===workspace.currentUserId?'You':agent.name}</option>)}</>}
 </select></label>
}
