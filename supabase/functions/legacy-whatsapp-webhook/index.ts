// The former super-task webhook is retired. It must never acknowledge and
// discard messages or log their contents. Keep a reversible tombstone.
Deno.serve(() => new Response(JSON.stringify({error:'This legacy WhatsApp webhook has been retired.'}), {
 status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
}));
