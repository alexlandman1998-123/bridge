import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
export async function checkSignatureImages(db,{A,admin,member}) {
 await db.exec(`reset role; create table if not exists auth.users(id uuid primary key); alter table storage.buckets add column if not exists allowed_mime_types text[]; alter table storage.objects add column if not exists metadata jsonb;`)
 await db.query('insert into auth.users values($1),($2) on conflict do nothing',[admin,member])
 await db.exec(await readFile(new URL('../../../../../supabase/migrations/20261118065636_shared_inbox_signature_image_assets.sql',import.meta.url),'utf8'))
 const as=async user=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`)
 await as(admin)
 const box=(await db.query("select shared_inbox_create_mailbox($1,'google_workspace','signature-fixture@example.test','Signature fixture','private',false) box",[A])).rows[0].box
 const reserve=async (mime='image/png')=>(await db.query("select shared_inbox_reserve_signature_image($1,$2,'logo.png',$3,32) image",[A,box.id,mime])).rows[0].image
 const image=await reserve()
 assert.equal((await db.query('select shared_inbox_signature_image_upload_allowed($1) ok',[image.storage_path])).rows[0].ok,true)
 await assert.rejects(reserve('image/svg+xml'),/JPG, PNG/)
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('email-signature-images',$1,$2)",[image.storage_path,JSON.stringify({mimetype:'image/png',size:32})])
 assert.equal((await db.query('select shared_inbox_confirm_signature_image($1,$2,$3) image',[A,box.id,image.id])).rows[0].image.id,image.id)
 await as(member)
 await assert.rejects(reserve(),/Mailbox management/)
 assert.equal((await db.query('select shared_inbox_signature_image_upload_allowed($1) ok',[image.storage_path])).rows[0].ok,false)
 await db.exec('reset role')
 console.log('Signature image hosting: owner-only upload, tenant-bound path, raster MIME restriction and confirmed Storage metadata passed.')
}
