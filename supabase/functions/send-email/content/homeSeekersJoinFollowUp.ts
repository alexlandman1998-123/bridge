const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function buildHomeSeekersJoinFollowUp(contact: Record<string, any>, recipient: string) {
  const visitor = recipient === contact.email;
  const breakdown = contact.type === 'breakdown';
  const call = contact.type === 'call';
  const subject = visitor && breakdown ? 'Your Home Seekers split breakdown'
    : visitor && call ? 'Your Home Seekers call request' : String(contact.subject);
  const intro = visitor && call
    ? 'Your details are saved. Choose a time with Thomas to complete your booking. This request is not a confirmed appointment.'
    : visitor && breakdown ? 'Here is your commission breakdown, using the figures you entered.' : 'A Home Seekers recruitment enquiry is ready for follow-up.';
  const calendar = new URL('https://calendly.com/thomas-homeseekers/30min');
  if (call && visitor) { calendar.searchParams.set('name', String(contact.name)); calendar.searchParams.set('email', String(contact.email)); }
  const link = call && visitor ? calendar.href : 'https://www.homeseeker.co.za/join';
  const label = call && visitor ? 'Book a call with Thomas' : 'Home Seekers';
  const details = String(contact.details);
  const text = `${intro}\n\n${details}\n\n${label}: ${link}\n\nHome Seekers · admin@homeseekers.co.za`;
  const html = `<div style="background:#171717;color:#fff;font:16px/1.65 Arial,sans-serif;padding:32px;max-width:640px;margin:auto"><h1 style="font-size:24px;color:#fff">${escape(subject)}</h1><p>${escape(intro)}</p><div style="white-space:pre-wrap;color:#ddd">${escape(details)}</div><p><a href="${escape(link)}" style="display:inline-block;background:#ff6319;color:#111;font-weight:bold;padding:14px 20px;text-decoration:none">${escape(label)}</a></p><hr style="border:0;border-top:1px solid #444"><p>Home Seekers<br><a style="color:#fff" href="mailto:admin@homeseekers.co.za">admin@homeseekers.co.za</a></p></div>`;
  return {subject,text,html};
}
