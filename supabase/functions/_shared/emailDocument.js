// Versioned email documents are shared by the editor and delivery functions.
export const TOKENS = [
  "first_name",
  "last_name",
  "full_name",
  "agent_name",
  "agency_name",
  "branch_name",
];
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeUrl = (value) =>
  /^(https?:\/\/|mailto:)/i.test(String(value || "").trim())
    ? escapeHtml(String(value).trim())
    : "";
const colour = (value, fallback) =>
  /^#[\da-f]{3}([\da-f]{3})?$/i.test(value || "") ? value : fallback;
export function mergeEmail(html, values = {}) {
  const defaults = {
    first_name: "there",
    last_name: "",
    full_name: "there",
    agent_name: "your agent",
    agency_name: "your agency",
    branch_name: "our team",
  };
  return String(html || "").replace(
    /\{\{(first_name|last_name|full_name|agent_name|agency_name|branch_name)\}\}/g,
    (_, key) => escapeHtml(String(values[key] || "").trim() || defaults[key]),
  );
}
export function newBlock(type) {
  const base = {
    id: globalThis.crypto.randomUUID(),
    type,
    align: "center",
    padding: 18,
  };
  return {
    ...base,
    ...({
      header: { text: "{{agency_name}}", src: "" },
      text: { text: "Share your update here.", style: "body" },
      image: { src: "", alt: "Property photograph", url: "" },
      button: { text: "View properties", url: "", variant: "filled" },
      property: { listings: [], layout: "grid", text: "View property" },
      divider: {},
      social: { links: [{ label: "Website", url: "" }] },
      footer: {},
    }[type] || {}),
  };
}
export function createEmailDocument(brand = {}) {
  const header = {
    ...newBlock("header"),
    text: brand.name || "{{agency_name}}",
    src: brand.logoUrl || "",
  };
  return {
    version: 1,
    mode: "visual",
    globalStyles: { primaryColour: "#18765b", fontFamily: "Arial", ...brand },
    blocks: [
      header,
      newBlock("image"),
      {
        ...newBlock("text"),
        text: "Homes worth seeing this week",
        style: "heading",
      },
      {
        ...newBlock("text"),
        text: "From coastal escapes to family homes, discover properties worth a closer look.",
      },
      newBlock("button"),
      newBlock("divider"),
      newBlock("footer"),
    ],
  };
}
export function normalizeDocument(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.blocks))
    throw new Error("This email document version is not supported.");
  const blocks = document.blocks.filter((block) =>
    [
      "header",
      "text",
      "image",
      "button",
      "property",
      "divider",
      "social",
    ].includes(block.type),
  );
  return {
    ...document,
    blocks: [
      ...blocks,
      document.blocks.find((b) => b.type === "footer") || newBlock("footer"),
    ],
  };
}
export function renderBlock(block, styles = {}, context = {}) {
  const primary = colour(block.colour || styles.primaryColour, "#18765b");
  const align = ["left", "center", "right"].includes(block.align)
    ? block.align
    : "left";
  const padding = Math.max(0, Math.min(60, Number(block.padding) || 0));
  const font = ["Arial", "Georgia", "Verdana"].includes(styles.fontFamily)
    ? styles.fontFamily
    : "Arial";
  const link = (label, url) =>
    safeUrl(url)
      ? `<a href="${safeUrl(url)}" style="color:${primary}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
  let inner = "";
  if (block.type === "header")
    inner = safeUrl(block.src)
      ? `<img src="${safeUrl(block.src)}" alt="${escapeHtml(block.text)}" width="180" style="max-width:100%;height:auto" />`
      : `<h2 style="margin:0;font: bold 28px Georgia">${escapeHtml(block.text)}</h2>`;
  if (block.type === "text") {
    const tag = block.style === "heading" ? "h1" : "p";
    inner = `<${tag} style="margin:0;color:${colour(block.textColour, "#13223b")};font-size:${block.style === "heading" ? "30" : "15"}px;line-height:1.5;font-weight:${block.bold || block.style === "heading" ? "bold" : "normal"};font-style:${block.italic ? "italic" : "normal"}">${safeUrl(block.url) ? link(block.text, block.url) : block.richText ? sanitizeRichText(block.richText) : escapeHtml(block.text).replace(/\n/g, "<br>")}</${tag}>`;
  }
  if (block.type === "image" && safeUrl(block.src)) {
    inner = `<img src="${safeUrl(block.src)}" alt="${escapeHtml(block.alt)}" width="564" style="display:block;width:100%;max-width:564px;height:auto;border:0" />`;
    if (safeUrl(block.url))
      inner = `<a href="${safeUrl(block.url)}">${inner}</a>`;
  }
  if (block.type === "button")
    inner = `<a ${safeUrl(block.url) ? `href="${safeUrl(block.url)}"` : ""} style="display:inline-block;padding:12px 25px;border:1px solid ${primary};border-radius:5px;background:${block.variant === "outline" ? "#ffffff" : primary};color:${block.variant === "outline" ? primary : "#ffffff"};text-decoration:none;font-weight:bold">${escapeHtml(block.text)}</a>`;
  if (block.type === "divider")
    inner = '<hr style="border:0;border-top:1px solid #e2e8ef" />';
  if (block.type === "social")
    inner = (block.links || [])
      .map((x) => link(x.label, x.url))
      .join(" &nbsp; · &nbsp; ");
  if (block.type === "property") {
    const cards = (block.listings || []).map(
      (item) =>
        `<td class="email-property" width="${block.layout === "grid" ? "50%" : "100%"}" valign="top" style="padding:8px"><table role="presentation" width="100%"><tr><td>${safeUrl(item.image) ? `<img src="${safeUrl(item.image)}" alt="${escapeHtml(item.address)}" width="260" style="width:100%;height:auto" />` : ""}<p><strong>${escapeHtml(item.price)}</strong><br>${escapeHtml(item.address)}<br>${escapeHtml(item.suburb)}</p><p>${escapeHtml(item.features)}</p>${link(block.text || "View property", item.url)}</td></tr></table></td>`,
    );
    inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards.map((card, i) => (block.layout === "grid" ? `${i % 2 === 0 ? "<tr>" : ""}${card}${i % 2 === 1 || i === cards.length - 1 ? "</tr>" : ""}` : `<tr>${card}</tr>`)).join("")}</table>`;
  }
  if (block.type === "footer")
    inner = `<hr style="border:0;border-top:1px solid #e2e8ef"><p style="font-size:11px;line-height:1.6;color:#667085">You’re receiving this email from ${escapeHtml(context.agencyName || styles.name || "{{agency_name}}")}${context.senderEmail ? ` &lt;${escapeHtml(context.senderEmail)}&gt;` : ""}.${context.agencyAddress ? `<br>${escapeHtml(context.agencyAddress)}` : ""}<br>${safeUrl(context.unsubscribeUrl) ? `<a href="${safeUrl(context.unsubscribeUrl)}">Unsubscribe</a>` : "Unsubscribe · Personal link added on delivery"}</p>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="${align}" style="padding:${padding}px;font-family:${font},sans-serif;background:${colour(block.background, "#ffffff")}">${inner}</td></tr></table>`;
}
export function renderEmail(document, context = {}) {
  const doc = normalizeDocument(document);
  const html = doc.blocks
    .map((block) => renderBlock(block, doc.globalStyles, context))
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:480px){.email-property{display:block!important;width:100%!important;box-sizing:border-box}}</style></head><body style="margin:0;background:#f3f5f7"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(context.previewText || "")}</div><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#ffffff" cellpadding="0" cellspacing="0"><tr><td>${html}</td></tr></table></td></tr></table></body></html>`;
}
export function emailIssues(document) {
  if (document.mode === "advanced")
    return document.advancedHtml?.trim() ? [] : ["Add email content."];
  const issues = [];
  for (const b of document.blocks) {
    if (b.type === "button" && !safeUrl(b.url))
      issues.push("Add a valid destination to each button.");
    if (b.type === "image" && !safeUrl(b.src))
      issues.push("Choose an image or remove the empty image block.");
    if (b.type === "property" && !b.listings?.length)
      issues.push("Select at least one property listing.");
    if (b.type === "property" && b.listings?.some((x) => !safeUrl(x.url)))
      issues.push("Add public links for each selected listing.");
  }
  return [...new Set(issues)];
}

export function sanitizeRichText(value) {
  return String(value || "")
    .replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, (tag) => {
      const match = tag.match(/^<(\/)?(strong|b|em|i|p|div|br|ul|ol|li|a)\b/i);
      if (!match) return "";
      const name = match[2].toLowerCase();
      if (match[1]) return `</${name}>`;
      if (name === "a") {
        const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] || "";
        // Decode ampersands only; never turn encoded schemes into executable URLs.
        return safeUrl(href)
          ? `<a href="${safeUrl(href.replace(/&amp;/g, "&"))}">`
          : "<a>";
      }
      return `<${name}>`;
    });
}
