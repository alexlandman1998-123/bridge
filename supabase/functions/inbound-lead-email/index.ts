// Retired endpoint. Historical messages remain in the database for review,
// but no new inbound email may create a lead or contact.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "inbound_email_capture_retired" }), {
    status: 410,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
);
