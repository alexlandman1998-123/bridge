import { supabase } from '../lib/supabaseClient'
import { parseCsvText, normalizeImportHeaderKey } from '../lib/csvImport'
export const AUDIENCE_IMPORT_LIMIT=1000
export const AUDIENCE_IMPORT_FIELDS=[['email','Email address',true],['firstName','First name'],['lastName','Last name'],['area','Area'],['roleType','Contact type'],['consent','Email permission'],['consentSource','Permission source'],['consentAt','Permission date (YYYY-MM-DD)']]
const aliases={email:['email','emailaddress','emailaddress1'],firstName:['firstname','givenname'],lastName:['lastname','surname','familyname'],area:['area','suburb','city'],roleType:['contacttype','type','role'],consent:['consent','emailpermission','marketingconsent','permissionstatus'],consentSource:['consentsource','permissionsource'],consentAt:['consentdate','permissiondate','consentat']}
export function prepareAudienceSheet(grid){
 const content=grid.filter(row=>row.some(cell=>String(cell??'').trim()))
 const [head=[],...body]=content
 if(!head.length||head.length>50||!body.length)throw Error('Choose a file with a header row and at least one contact (up to 50 columns).')
 if(body.length>AUDIENCE_IMPORT_LIMIT)throw Error('Import up to 1,000 contacts per file.')
 const headers=head.map(value=>String(value??'').trim())
 if(headers.some(value=>!value)||new Set(headers.map(normalizeImportHeaderKey)).size!==headers.length)throw Error('Give each column a unique, non-empty heading.')
 const mapping=Object.fromEntries(AUDIENCE_IMPORT_FIELDS.map(([field])=>[field,headers.findIndex(header=>aliases[field].includes(normalizeImportHeaderKey(header)))]))
 return {headers,rows:body.map((cells,index)=>({number:index+2,cells:headers.map((_,i)=>String(cells[i]??'').trim())})),mapping}
}
export async function readAudienceImportFile(file){
 if(!file||file.size>5*1024*1024)throw Error('Choose an Excel or CSV file up to 5 MiB.')
 const extension=file.name.split('.').pop().toLowerCase()
 if(extension==='csv')return prepareAudienceSheet(parseCsvText(await file.text()))
 if(!['xlsx','xls'].includes(extension))throw Error('Choose a .csv, .xlsx or .xls file.')
 const XLSX=await import('xlsx')
 const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:AUDIENCE_IMPORT_LIMIT+2,cellDates:true,dateNF:'yyyy-mm-dd'})
 if(workbook.SheetNames.length!==1)throw Error('Keep your audience on a single worksheet before importing.')
 const worksheet=workbook.Sheets[workbook.SheetNames[0]]
 if(worksheet['!fullref']&&XLSX.utils.decode_range(worksheet['!fullref']).e.r>AUDIENCE_IMPORT_LIMIT)throw Error('Import up to 1,000 contacts per worksheet. Remove unused rows first.')
 return prepareAudienceSheet(XLSX.utils.sheet_to_json(worksheet,{header:1,defval:'',raw:false,dateNF:'yyyy-mm-dd'}))
}
export function reviewAudienceImport(sheet,mapping,now=new Date()){
 const seen=new Map(),rows=[]
 for(const row of sheet.rows){
  const read=field=>row.cells[Number(mapping[field])]||''
  const contact=Object.fromEntries(AUDIENCE_IMPORT_FIELDS.map(([field])=>[field,read(field)]))
  contact.email=contact.email.toLowerCase();contact.roleType=contact.roleType.toLowerCase();let error=''
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contact.email)||contact.email.length>254)error='Invalid email address'
  const status=contact.consent.trim().toLowerCase().replace(/[ -]/g,'_')
  const statuses={'':'unknown',unknown:'unknown',not_recorded:'unknown',opted_in:'opted_in',subscribed:'opted_in',opted_out:'opted_out',unsubscribed:'opted_out'}
  if(!Object.hasOwn(statuses,status))error='Use opted_in, opted_out or unknown for permission'
  contact.consent=statuses[status]||'unknown'
  if(contact.firstName.length>120||contact.lastName.length>120||contact.area.length>160||contact.roleType.length>80||contact.consentSource.length>500)error='A field exceeds its length limit'
  if(contact.consent==='opted_in'){
   if(!contact.consentSource||!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(contact.consentAt))error='Opted-in contacts need a permission source and ISO date'
   else{const date=new Date(contact.consentAt);if(!Number.isFinite(date.getTime())||date>now||date.toISOString().slice(0,10)!==contact.consentAt.slice(0,10))error='Invalid or future permission date';else contact.consentAt=date.toISOString()}
  }else contact.consentAt=''
  if(error){rows.push({number:row.number,contact,state:'invalid',message:error});continue}
  if(seen.has(contact.email)){
   const prior=seen.get(contact.email)
   // Conflicting permission must never turn a duplicate opt-out into an opt-in.
   if(contact.consent==='opted_out'||(contact.consent==='unknown'&&prior.contact.consent==='opted_in'))prior.contact={...prior.contact,consent:contact.consent,consentSource:contact.consentSource,consentAt:''}
   rows.push({number:row.number,contact,state:'duplicate',message:'Repeated email address'});continue
  }
  const ready={number:row.number,contact,state:'ready',message:'Ready'};seen.set(contact.email,ready);rows.push(ready)
 }
 return {rows,contacts:rows.filter(row=>row.state==='ready').map(row=>row.contact),invalid:rows.filter(row=>row.state==='invalid').length,duplicates:rows.filter(row=>row.state==='duplicate').length}
}
export async function importAudienceContacts({organisationId,requestId,name,subscriptionId,contacts}){
 const {data,error}=await supabase.rpc('email_import_audience',{p_org:organisationId,p_request:requestId,p_name:name.trim(),p_subscription:subscriptionId,p_rows:contacts})
 if(error){if(error.code==='23505')throw Object.assign(Error('An audience with this name already exists. Choose another name.'),{code:error.code});if(['PGRST202','42883'].includes(error.code))throw Error('Audience imports need the database update before they can be used. Your file has not been imported.');throw error}
 if(!data?.audienceId||!Array.isArray(data.contactIds)||!data.contactIds.length)throw Error('The import could not be confirmed. Retry this same request.')
 return data
}
