import { createRequire } from 'node:module'
import path from 'node:path'
import { assessDocumentGeneratorLaunchChain } from '../src/core/documents/documentGeneratorLaunchChain.js'

const require=createRequire(path.resolve('package.json'))
const {createClient}=require('@supabase/supabase-js')
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||''
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||''
if(!url||!key) throw new Error('Supabase URL and service role key are required for G1 verification.')
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const organisationId=String(process.env.LEGAL_DOCUMENT_G1_ORGANISATION_ID||'').trim()
let query=client.from('document_packets').select('id,organisation_id,packet_type,current_version_number,status,updated_at').in('packet_type',['otp','mandate']).eq('status','completed').order('updated_at',{ascending:false}).limit(100)
if(organisationId) query=query.eq('organisation_id',organisationId)
const packets=await query
if(packets.error) throw packets.error
const grouped=new Map()
for(const packet of packets.data||[]){const org=String(packet.organisation_id);if(!grouped.has(org)) grouped.set(org,{});const group=grouped.get(org);if(!group[packet.packet_type]) group[packet.packet_type]=packet}
const selected=[...grouped.entries()].find(([,group])=>group.otp&&group.mandate)||null
const blockers=[];const evidence=[]
if(!selected) blockers.push({phase:'G1',code:'G1_CONTROLLED_PAIR_MISSING',solution:'Complete one OTP and one mandate through F5 for the same organisation.'})
if(selected){
  const [org,group]=selected
  for(const type of ['otp','mandate']){
    const packet=group[type]
    const version=await client.from('document_packet_versions').select('id').eq('packet_id',packet.id).eq('version_number',packet.current_version_number).maybeSingle()
    if(version.error||!version.data){blockers.push({phase:'A',code:'G1_CURRENT_VERSION_MISSING',packetType:type,solution:'Restore the packet current version before rerunning G1.'});continue}
    const chain=await client.rpc('bridge_get_document_generator_launch_chain_g1',{p_packet_id:packet.id,p_packet_version_id:version.data.id})
    if(chain.error){blockers.push({phase:'G1',code:'G1_EVIDENCE_UNAVAILABLE',packetType:type,solution:'Deploy migration 202607180023 and restore evidence read access.'});continue}
    const assessment=assessDocumentGeneratorLaunchChain(chain.data||{})
    evidence.push({organisationId:org,packetType:type,packetId:packet.id,versionId:version.data.id,transactionId:chain.data?.transactionPublication?.transactionId||null,finalArtifactPath:chain.data?.finalArtifact?.path||null,ready:assessment.ready,completedStageCount:assessment.completedStageCount,totalStageCount:assessment.totalStageCount,firstBlocker:assessment.firstBlocker})
    blockers.push(...assessment.blockers.map((item)=>({...item,packetType:type,packetId:packet.id})))
  }
}
console.log(JSON.stringify({phase:'G1',status:blockers.length?'NO_GO':'READY_FOR_G2',ready:blockers.length===0,blockerCount:blockers.length,blockers,evidence,checkedAt:new Date().toISOString(),mutatedData:false},null,2))
if(blockers.length) process.exitCode=1
