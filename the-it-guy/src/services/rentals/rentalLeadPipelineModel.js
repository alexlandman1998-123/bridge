export const RENTAL_LEAD_PIPELINE_VERSION='arch9_rental_lead_pipeline_v1'
export const RENTAL_LEAD_PIPELINE_STAGES=Object.freeze(['new','contacted','viewing','application'])
const next={new:['contacted'],contacted:['viewing'],viewing:['application','contacted'],application:[]};const text=(v)=>String(v??'').trim().toLowerCase()
export function canTransitionRentalLead(from='',to=''){return next[text(from)]?.includes(text(to))===true}
export function transitionRentalLead(lead={},to=''){if(!canTransitionRentalLead(lead.stage,to))throw new Error(`Rental lead cannot move from ${lead.stage||'unknown'} to ${to||'unknown'}.`);return {...lead,stage:text(to),nextAction: text(to)==='contacted'?'Schedule viewing':text(to)==='viewing'?'Record viewing outcome':'Review application'}}
export function buildRentalPipelineSummary(leads=[]){return RENTAL_LEAD_PIPELINE_STAGES.map((stage)=>({stage,count:(Array.isArray(leads)?leads:[]).filter((lead)=>text(lead.stage)===stage).length}))}
