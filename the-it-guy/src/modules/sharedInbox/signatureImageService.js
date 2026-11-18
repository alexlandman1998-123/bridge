import { supabase } from '../../lib/supabaseClient'

export const SIGNATURE_IMAGE_BUCKET='email-signature-images'
export const SIGNATURE_IMAGE_MAX_BYTES=5*1024*1024
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const extensions={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'}

async function bytes(blob){return new Uint8Array(await blob.slice(0,16).arrayBuffer())}
export async function validateSignatureImage(file){
 if(typeof File==='undefined'||!(file instanceof File)||!extensions[file.type]||!file.size||file.size>SIGNATURE_IMAGE_MAX_BYTES)throw new Error('Choose a non-empty JPG, PNG, GIF or WebP image under 5 MB.')
 const data=await bytes(file),starts=value=>value.every((byte,index)=>data[index]===byte),ascii=(a,b)=>String.fromCharCode(...data.slice(a,b))
 const valid=file.type==='image/jpeg'?starts([0xff,0xd8,0xff]):file.type==='image/png'?starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]):file.type==='image/gif'?['GIF87a','GIF89a'].includes(ascii(0,6)):ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'
 if(!valid)throw new Error(`The contents of ${file.name} do not match its image type.`)
 return file.name.split(/[\\/]/).pop().slice(0,180)
}
export async function hostSignatureImage({organisationId,channelId,file}){
 const name=await validateSignatureImage(file)
 const {data:reserved,error}=await supabase.rpc('shared_inbox_reserve_signature_image',{p_organisation_id:organisationId,p_channel_id:channelId,p_name:name,p_mime:file.type,p_size:file.size})
 if(error)throw error
 const expected=`organisations/${organisationId}/mailboxes/${channelId}/${reserved?.id}.${extensions[file.type]}`
 if(!uuid.test(reserved?.id||'')||reserved.organisation_id!==organisationId||reserved.channel_id!==channelId||reserved.storage_path!==expected)throw new Error('The hosted image location could not be confirmed.')
 let uploadError
 try{uploadError=(await supabase.storage.from(SIGNATURE_IMAGE_BUCKET).upload(expected,file,{contentType:file.type,cacheControl:'31536000',upsert:false})).error}catch(error){uploadError=error}
 // Confirm storage metadata even if the upload request timed out after succeeding.
 const {data:asset,error:confirmError}=await supabase.rpc('shared_inbox_confirm_signature_image',{p_organisation_id:organisationId,p_channel_id:channelId,p_image_id:reserved.id})
 if(confirmError)throw uploadError||confirmError
 const {data:url}=supabase.storage.from(SIGNATURE_IMAGE_BUCKET).getPublicUrl(asset.storage_path)
 if(!url?.publicUrl)throw new Error('The hosted image URL could not be created.')
 return {url:url.publicUrl,name}
}
