import {isSupabaseConfigured,supabase} from '../../lib/supabaseClient.js'
import { runRecoverableDocumentUpload } from '../../lib/documentUploadRecovery.js'
import { createDocumentUploadProgressReporter, withDocumentUploadDeadline } from '../../lib/documentUploadLifecycle.js'
const BUCKET='rental-lease-files'
const TYPES={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
const text=value=>String(value??'').trim()
const client=db=>{if(!db||(!isSupabaseConfigured&&db===supabase))throw new Error('Lease uploads require a configured connection.');return db}
export async function uploadRentalLeaseDocument({workspace,file,kind='agreement',signerId='',confirmSigned=false,evidenceNote='',receipt=null},{client:db=supabase,onProgress=null}={}){
 const leaseId=workspace?.lease?.id,version=workspace?.version
 if(!leaseId||!version?.id||!version?.organisation_id)throw new Error('Refresh the saved lease version before uploading its documents.')
 if(!['agreement','signed_agreement','move_in_evidence'].includes(kind))throw new Error('Choose an agreement or signed agreement.')
 if(kind==='signed_agreement'&&(!signerId||confirmSigned!==true))throw new Error('Confirm that this uploaded copy contains the selected person’s signature.')
 const storage=client(db).storage.from(BUCKET)
 let saved=receipt
 if(saved&& (saved.leaseId!==leaseId||saved.versionId!==version.id||saved.kind!==kind||saved.signerId!==signerId))throw new Error('This uploaded file belongs to a different lease version or person.')
 const register=async()=>{
  const result=await client(db).rpc('rental_register_lease_document',{p_lease_id:leaseId,p_expected_version:version.version_number,p_upload_id:saved.id,p_kind:kind,p_signer_id:text(signerId)||null,p_storage_path:saved.path,p_file_name:saved.fileName,p_confirm_signed:confirmSigned===true,p_evidence_note:text(evidenceNote)||null})
  if(result.error)throw result.error
  if(result.data?.id!==saved.id||result.data.lease_version_id!==version.id)throw new Error('The saved document connection could not be confirmed.')
  return result
 }
 try{
  // Older callers can retry a known receipt without keeping the File in memory.
  // This only retries the idempotent registration, never transfers new bytes.
  if(saved&&!file){
   const report=createDocumentUploadProgressReporter(onProgress)
   report('saving','',{fileName:saved.fileName})
   const result=await withDocumentUploadDeadline(register,{timeoutMs:30000})
   report('complete','Uploaded',{fileName:saved.fileName,documentId:result.data.id})
   return result.data
  }
  const extension=text(file?.name).split('.').pop().toLowerCase(),mime=TYPES[extension]
  if(!file||!mime||!Number.isFinite(file.size)||file.size<1||file.size>20*1024*1024||file.name.length>255)throw new Error('Choose a PDF, Word document, JPG or PNG of 20 MB or less.')
  if(file.type&&file.type!==mime&&file.type!=='application/octet-stream')throw new Error('The selected file type does not match its extension.')
  return await runRecoverableDocumentUpload({client:db,file,onProgress,monitorSurface:'rental',scope:['rental_lease',version.organisation_id,leaseId,version.id,kind,signerId],storageBuckets:[BUCKET],
   recoverStorage:async context=>{
    const result=await storage.createSignedUrl(context.path,60)
    if(!result.error&&result.data?.signedUrl)return true
    if(Number(result.error?.statusCode||result.error?.status)===404||/object (?:not found|does not exist)/i.test(result.error?.message||''))return false
    throw new Error('The original lease file transfer could not be checked. Retry before selecting another file.')
   },
   run:async attempt=>{
    if(attempt.context)saved=attempt.context
    else{
     if(!saved){const id=crypto.randomUUID();saved={id,leaseId,versionId:version.id,kind,signerId,path:`${version.organisation_id}/${leaseId}/${version.id}/${id}.${extension}`,fileName:file.name,storageUnconfirmed:true}}
     attempt.setContext(saved)
    }
    await attempt.upload(async()=>{
     if(!receipt||saved.storageUnconfirmed){const uploaded=await storage.upload(saved.path,file,{contentType:mime,upsert:false});if(uploaded.error)throw uploaded.error}
     saved={...saved,storageUnconfirmed:false};attempt.setContext(saved)
     return BUCKET
    })
    const result=await attempt.persist({save:register,read:register})
    return result.data
   },
  })
 }catch(cause){
  const error=new Error(cause?.message||'The file could not be saved. Retry this upload.')
  if(saved)error.uploadReceipt=saved
  error.code=cause?.code
  throw error
 }
}

export async function getRentalLeaseDocumentUrl(upload,{client:db=supabase}={}){
 if(upload?.storage_bucket!==BUCKET||!text(upload.storage_path))throw new Error('Choose a saved lease upload.')
 const result=await client(db).storage.from(BUCKET).createSignedUrl(upload.storage_path,300)
 if(result.error||!result.data?.signedUrl)throw new Error(result.error?.message||'Unable to open this private lease document.')
 return result.data.signedUrl
}
