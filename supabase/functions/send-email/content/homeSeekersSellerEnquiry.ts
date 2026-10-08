const ORANGE = "#ff6319";
const INK = "#171717";
const PAPER = "#f4f4f2";
const MUTED = "#626b70";

export type HomeSeekersSellerEnquiry = {
  sellerName: string;
  preview?: boolean;
  sellerEmail?: string;
  sellerPhone?: string;
  propertyAddress?: string;
  message?: string;
  leadUrl?: string;
};

type EmailContent = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

function clean(value: unknown, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function oneLine(value: unknown, limit = 1000) {
  return clean(value, limit).replace(/\s+/g, " ");
}

function escapeHtml(value: unknown) {
  return clean(value, 4000).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function firstName(value: string) {
  return oneLine(value, 160).split(" ")[0] || "there";
}

function safeHref(value: string, schemes: string[]) {
  try {
    const url = new URL(value);
    return schemes.includes(url.protocol) ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}

function detail(label: string, value: string) {
  if (!clean(value)) return "";
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #e4e4e1;vertical-align:top;color:${MUTED};font:700 11px/1.5 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;width:132px;">${
    escapeHtml(label)
  }</td><td style="padding:14px 0;border-bottom:1px solid #e4e4e1;color:${INK};font:600 15px/1.5 Arial,sans-serif;word-break:break-word;">${
    escapeHtml(value)
  }</td></tr>`;
}

function button(label: string, href: string) {
  const safeUrl = safeHref(href, ["https:", "mailto:", "tel:"]);
  if (!safeUrl) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 0;border-collapse:collapse;"><tr><td bgcolor="${ORANGE}" style="background:${ORANGE};"><a href="${safeUrl}" style="display:block;padding:17px 22px;color:${INK};font:800 12px/1.3 Arial,sans-serif;letter-spacing:.06em;text-decoration:none;text-transform:uppercase;">${
    escapeHtml(label)
  } &nbsp;→</a></td></tr></table>`;
}

function layout(
  { eyebrow, title, preheader, intro, content, footerNote, preview }: {
    eyebrow: string;
    title: string;
    preheader: string;
    intro: string;
    content: string;
    footerNote: string;
    preview?: boolean;
  },
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${
    escapeHtml(title)
  }</title><style>@media(max-width:600px){.hs-shell{width:100%!important}.hs-pad{padding-left:25px!important;padding-right:25px!important}.hs-title{font-size:44px!important}.hs-grid{display:block!important;width:100%!important}}</style></head>
<body style="margin:0;padding:0;background:#e9e9e6;color:${INK};font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${
    escapeHtml(preheader)
  }</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#e9e9e6;"><tr><td align="center" style="padding:32px 14px;">
<table class="hs-shell" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:100%;border-collapse:collapse;background:#fff;">
${
    preview
      ? `<tr><td style="padding:12px 25px;background:${ORANGE};color:${INK};text-align:center;font:800 11px/1.5 Arial,sans-serif;letter-spacing:.12em;">DESIGN PREVIEW · NO ACTION REQUIRED</td></tr>`
      : ""
  }
<tr><td class="hs-pad" style="padding:25px 42px;background:${INK};border-top:7px solid ${ORANGE};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="color:#fff;font:900 18px/1 Arial,sans-serif;letter-spacing:-.05em;">HOME<br>SEEKERS<span style="color:${ORANGE};">.</span></td><td align="right" style="color:#aeb6b8;font:700 10px/1.5 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;">AN ARCH9 CONCIERGE<br>MESSAGE</td></tr></table>
</td></tr>
<tr><td class="hs-pad" style="padding:48px 42px 42px;background:${INK};color:#fff;">
<p style="margin:0 0 24px;color:${ORANGE};font:800 11px/1.4 Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase;">${
    escapeHtml(eyebrow)
  }</p>
<h1 class="hs-title" style="margin:0;max-width:540px;color:#fff;font:900 56px/.99 Arial,sans-serif;letter-spacing:-.065em;">${
    escapeHtml(title)
  }</h1>
<p style="margin:25px 0 0;max-width:490px;color:#d3d8da;font:400 17px/1.6 Arial,sans-serif;">${
    escapeHtml(intro)
  }</p>
</td></tr>
<tr><td class="hs-pad" style="padding:38px 42px 45px;background:#fff;">${content}</td></tr>
<tr><td class="hs-pad" style="padding:24px 42px;background:${PAPER};border-top:1px solid #e1e1de;">
<p style="margin:0 0 9px;color:${INK};font:800 12px/1.5 Arial,sans-serif;letter-spacing:.04em;">MOVE FORWARD, FASTER.</p>
<p style="margin:0;color:${MUTED};font:400 12px/1.6 Arial,sans-serif;">${
    escapeHtml(footerNote)
  }</p>
<p style="margin:13px 0 0;color:${MUTED};font:400 11px/1.6 Arial,sans-serif;">Arch9 Concierge for Home Seekers · 786 Witdoring Avenue, Moreleta Park, Pretoria</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function buildHomeSeekersSellerAgencyEmail(
  input: HomeSeekersSellerEnquiry,
): EmailContent {
  const sellerName = oneLine(input.sellerName, 160) || "A prospective seller";
  const address = oneLine(input.propertyAddress, 300);
  const message = clean(input.message, 1500);
  const leadUrl = clean(input.leadUrl, 600);
  const subject = `${
    input.preview ? "[TEST] " : ""
  }New Home Seekers seller enquiry · ${sellerName}`;
  const preheader = `${sellerName} is ready to talk about selling${
    address ? ` · ${address}` : ""
  }.`;
  const content =
    `<p style="margin:0 0 22px;color:${INK};font:700 19px/1.4 Arial,sans-serif;letter-spacing:-.03em;">The next move starts with a conversation.</p>
<p style="margin:0 0 24px;color:${MUTED};font:400 15px/1.65 Arial,sans-serif;">A seller has reached out through the Home Seekers website. Review their details, make personal contact, and set a clear next step.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-top:3px solid ${ORANGE};">
${detail("Seller", sellerName)}${
      detail("Email", clean(input.sellerEmail, 254))
    }${detail("Phone", clean(input.sellerPhone, 64))}${
      detail("Property", address)
    }${detail("Their note", message)}</table>
${safeHref(leadUrl, ["https:"]) ? button("Open seller lead", leadUrl) : ""}
<p style="margin:25px 0 0;padding-left:14px;border-left:3px solid ${ORANGE};color:${INK};font:600 14px/1.55 Arial,sans-serif;">Lead with an honest price, a serious plan and clear follow-through.</p>`;
  const html = layout({
    eyebrow: "New seller enquiry / Home Seekers",
    title: "A new move is in motion.",
    preheader,
    intro:
      "Someone has put their next move in our hands. Let’s make the first response count.",
    content,
    footerNote:
      "This enquiry was sent only to the Home Seekers team. Handle the seller’s details with care.",
    preview: input.preview,
  });
  const text = [
    `New seller enquiry: Home Seekers`,
    "",
    `${sellerName} has enquired about selling.`,
    address ? `Property: ${address}` : "",
    input.sellerEmail ? `Email: ${clean(input.sellerEmail, 254)}` : "",
    input.sellerPhone ? `Phone: ${clean(input.sellerPhone, 64)}` : "",
    message ? `Message: ${message}` : "",
    leadUrl ? `Open seller lead: ${leadUrl}` : "",
    "",
    "Make personal contact and agree on the next step.",
    "Arch9 Concierge for Home Seekers",
  ].filter(Boolean).join("\n");
  return { subject, preheader, html, text };
}

export function buildHomeSeekersSellerClientEmail(
  input: HomeSeekersSellerEnquiry,
): EmailContent {
  const name = firstName(input.sellerName);
  const address = oneLine(input.propertyAddress, 300);
  const subject = `${
    input.preview ? "[TEST] " : ""
  }Your next move starts here | Home Seekers`;
  const preheader =
    "We received your seller enquiry. A real person will be in touch.";
  const content =
    `<p style="margin:0 0 17px;color:${INK};font:800 22px/1.35 Arial,sans-serif;letter-spacing:-.04em;">Hi ${
      escapeHtml(name)
    },</p>
<p style="margin:0 0 20px;color:#333;font:400 16px/1.7 Arial,sans-serif;">Thanks for telling us you’re thinking about selling${
      address ? ` ${escapeHtml(address)}` : ""
    }. Your enquiry is with the Home Seekers team. A real person will get in touch to understand your plans and agree on the right next step.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:${PAPER};"><tr><td style="padding:25px 27px;border-left:5px solid ${ORANGE};">
<p style="margin:0 0 15px;color:${INK};font:800 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;">What happens next</p>
<p style="margin:0 0 11px;color:${INK};font:600 15px/1.5 Arial,sans-serif;"><span style="color:${ORANGE};font-weight:900;">01 /</span> We listen to what matters to you.</p>
<p style="margin:0 0 11px;color:${INK};font:600 15px/1.5 Arial,sans-serif;"><span style="color:${ORANGE};font-weight:900;">02 /</span> We look at your home and the local market.</p>
<p style="margin:0;color:${INK};font:600 15px/1.5 Arial,sans-serif;"><span style="color:${ORANGE};font-weight:900;">03 /</span> We agree on a clear plan together.</p>
</td></tr></table>
<p style="margin:23px 0 0;color:${MUTED};font:400 14px/1.65 Arial,sans-serif;">Nothing else is needed from you right now. If you have a question, reply to this email or call <a href="tel:+27128803127" style="color:${INK};font-weight:700;text-decoration:underline;">+27 12 880 3127</a>.</p>
${
      button(
        "See how we sell",
        "https://app.arch9.co.za/demo/homeseekers/selling",
      )
    }`;
  const html = layout({
    eyebrow: "Your enquiry is with us",
    title: "A clearer way forward.",
    preheader,
    intro:
      "Selling a home is a big move. We’ll make the next step feel clear, personal and considered.",
    content,
    footerNote:
      "You received this because you sent a seller enquiry to Home Seekers. We will use your details only to follow up on that enquiry.",
    preview: input.preview,
  });
  const text = [
    `Hi ${name},`,
    "",
    `Thanks for telling us you’re thinking about selling${
      address ? ` ${address}` : ""
    }. Your enquiry is with the Home Seekers team. A real person will get in touch to understand your plans and agree on the right next step.`,
    "",
    "What happens next",
    "1. We listen to what matters to you.",
    "2. We look at your home and the local market.",
    "3. We agree on a clear plan together.",
    "",
    "Nothing else is needed from you right now. Reply to this email or call +27 12 880 3127 if you have a question.",
    "See how we sell: https://app.arch9.co.za/demo/homeseekers/selling",
    "",
    "Arch9 Concierge for Home Seekers",
  ].join("\n");
  return { subject, preheader, html, text };
}
