import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req: Request) => {
  try {
    const { to, name } = await req.json();

    const { data, error } = await resend.emails.send({
      from: "Bridge <onboarding@resend.dev>",
      to,
      subject: "Bridge email test",
      html: `<p>Hi ${name}, your Bridge email system is working.</p>`,
    });

    if (error) {
      return new Response(JSON.stringify(error), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});