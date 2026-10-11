export const LEGAL_DOCUMENT_BUCKET = 'arch9-legal-matters';
export const LEGAL_FILE_TYPES = Object.freeze({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
export const MAX_LEGAL_FILE_SIZE = 6 * 1024 * 1024;
export async function fileDigest(file) {
  const bytes=await file.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function legalFileMetadata(file) {
  const mime=LEGAL_FILE_TYPES[file?.name?.split('.').at(-1)?.toLowerCase()];
  if(!mime||!file.size||file.size>MAX_LEGAL_FILE_SIZE||file.name.length>200)throw new Error('Choose a PDF, DOCX, PNG or JPEG file up to 6 MB.');
  if(file.type&&file.type!==mime)throw new Error('The file type does not match its extension.');
  return {filename:file.name,mime_type:mime,byte_size:file.size,sha256:await fileDigest(file)};
}
export function createLegalDocumentService(client,call,firmId) {
  const workCommand=({firmId:firm,requestId,action,payload})=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))throw new TypeError('A stable request identity is required');
    return call(['configure_trusts','start_trusts','save_trust_dates'].includes(action)?'arch9_legal_trust_pilot_command':'arch9_legal_work_command',{p_firm_id:firmId(firm),p_request_id:requestId,p_action:action,p_payload:payload});
  };
  const storage=()=>{
    if(!client.storage?.from)throw new Error('Private document storage is unavailable.');
    return client.storage.from(LEGAL_DOCUMENT_BUCKET);
  };
  async function downloadVersion(firm,matterId,versionId) {
    // A fresh read also validates the exact matter/version mapping before Storage enforces RLS.
    const data=await call('arch9_legal_work_read',{p_firm_id:firmId(firm),p_matter_id:matterId});
    const version=[...data.documents.flatMap(d=>d.versions),...data.pending_uploads].find(v=>v.id===versionId);
    if(!version)throw Object.assign(new Error('Document access denied.'),{code:'42501'});
    const {data:blob,error}=await storage().download(version.path);
    if(error)throw error;
    if(blob.size!==version.byte_size||await fileDigest(blob)!==version.sha256)throw new Error('File verification failed.');
    return {blob,version};
  }
  return {
    workCommand,
    work(firm,matterId){return call('arch9_legal_work_read',{p_firm_id:firmId(firm),p_matter_id:matterId});},
    downloadVersion,
    async cancelDocument({firmId:firm,matterId,version,requestId}) {
      const data=await call('arch9_legal_work_read',{p_firm_id:firmId(firm),p_matter_id:matterId});
      const ready=data.documents.some(d=>d.versions.some(v=>v.id===version.id));
      return workCommand({firmId:firm,requestId:ready?version.id:requestId,action:ready?'commit_document':'cancel_document',payload:{matter_id:matterId,version_id:version.id}});
    },
    async reserveDocument({firmId:firm,requestId,payload}){return workCommand({firmId:firm,requestId,action:'reserve_document',payload});},
    async finishDocument({firmId:firm,matterId,version,file}) {
      if(file){
        const meta=await legalFileMetadata(file);
        if(meta.sha256!==version.sha256||meta.byte_size!==version.byte_size||meta.mime_type!==version.mime_type)throw new Error('Select the original file to resume this upload.');
        // INSERT only. A duplicate or lost response is recovered by authenticated read + hash verification.
        const {error}=await storage().upload(version.path,file,{contentType:version.mime_type,upsert:false,cacheControl:'0'});
        if(error){try{await downloadVersion(firm,matterId,version.id);}catch{throw error;}}
      }
      await downloadVersion(firm,matterId,version.id);
      return workCommand({firmId:firm,requestId:version.id,action:'commit_document',payload:{matter_id:matterId,version_id:version.id}});
    },
  };
}
