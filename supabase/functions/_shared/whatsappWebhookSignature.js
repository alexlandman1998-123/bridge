export async function verifyWebhookSignature(body,signature,secret){
 if(!/^sha256=[a-fA-F0-9]{64}$/.test(signature)||!secret)return false
 const bytes=Uint8Array.from(signature.slice(7).match(/../g),pair=>parseInt(pair,16))
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(body))
}
