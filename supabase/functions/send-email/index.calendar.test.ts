let handler: (request: Request) => Promise<Response>;
const serve=Deno.serve, originalFetch=globalThis.fetch;
Deno.serve=((callback: typeof handler)=>{handler=callback;}) as typeof Deno.serve;
await import('./index.ts');Deno.serve=serve;
Deno.test('Durable calendar sender rejects public credentials before recipient shortcuts or provider access',async()=>{
 const previous=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','calendar-fixture-service');
 let calls=0;globalThis.fetch=(async()=>{calls++;throw new Error('Provider access forbidden in authorization fixture');}) as typeof fetch;
 const body=JSON.stringify({type:'appointment_confirmed',to:'buyer@example.test',idempotencyKey:'calendar-appointment:10000000-0000-4000-8000-000000000003'});
 try{
  for(const authorization of ['', 'Bearer public-fixture-key']){
   const response=await handler(new Request('https://fixture.example.test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization},body}));
   if(response.status!==403)throw new Error('Public calendar delivery must be rejected');
  }
  if(calls!==0)throw new Error('Rejected callers must not reach database or provider');
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',previous);}
});
