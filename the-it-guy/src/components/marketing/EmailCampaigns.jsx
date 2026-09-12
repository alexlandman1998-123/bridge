import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileUp,
  Filter,
  Image,
  LayoutTemplate,
  Mail,
  MailOpen,
  MoreHorizontal,
  MousePointerClick,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  UsersRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import { useAuthSession } from "../../context/AuthSessionContext";
import {
  archiveEmailCampaign,
  assignEmailContactTag,
  cancelEmailCampaign,
  createEmailContactTag,
  duplicateEmailCampaign,
  enqueueEmailAutomationManualEvent,
  getEmailCampaignAnalytics,
  getEmailCampaignApprovals,
  getEmailAutomationJourneys,
  importEmailAudience,
  getEmailCampaignWorkspace,
  preflightEmailCampaign,
  previewEmailAudience,
  previewEmailAudienceDetail,
  refreshEmailSenderVerification,
  saveEmailAudience,
  saveEmailAutomation,
  saveEmailCampaign,
  saveEmailTemplate,
  scheduleEmailCampaign,
  sendEmailCampaignTest,
  setEmailCampaignApproval,
  setEmailAutomationJourneyStatus,
  uploadEmailImageAsset,
} from "../../services/emailCampaignService";

const STEPS = ["Details", "Audience", "Content", "Review"];
const fmt = (v) => new Intl.NumberFormat().format(Number(v || 0));
const rate = (v, total) =>
  total ? `${Math.round((Number(v || 0) * 100) / total)}%` : "—";
const getOrg = (a) =>
  String(
    a?.currentWorkspace?.id ||
      a?.currentMembership?.workspaceId ||
      a?.currentMembership?.workspace_id ||
      "",
  ).trim();
const safePreviewHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript\s*:/gi, "");
const inspectEmailHtml = (value) => {
  const html = String(value || "");
  const blockers = [/<script\b/i.test(html), /<iframe\b/i.test(html), /\son\w+\s*=/i.test(html), /javascript\s*:/i.test(html)].filter(Boolean).length;
  const warnings = [/<form\b/i.test(html), /<video\b|<audio\b/i.test(html), /position\s*:\s*(fixed|sticky)/i.test(html), /display\s*:\s*flex/i.test(html)].filter(Boolean).length;
  const images = [...html.matchAll(/<img\b[^>]*>/gi)];
  const missingAlt = images.filter(([tag]) => !/\balt\s*=/i.test(tag)).length;
  return { blockers, warnings, missingAlt, images: images.length, score: Math.max(0, 100 - blockers * 35 - warnings * 8 - missingAlt * 3), ready: blockers === 0 };
};
const escapeEmailText = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const campaignImage = (campaign) =>
  String(campaign?.html || "").match(
    /<img[^>]+src\s*=\s*["']([^"']+)["']/i,
  )?.[1] || "";
const stamp = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not scheduled";
const parseCsv = (input) => {
  const rows = [[]];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { rows.at(-1).push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      rows.at(-1).push(cell.trim()); cell = "";
      if (rows.at(-1).some(Boolean)) rows.push([]);
    } else cell += character;
  }
  if (cell || rows.at(-1).length) rows.at(-1).push(cell.trim());
  return rows.filter((row) => row.some(Boolean));
};
const IMPORT_FIELDS = ["email", "first_name", "last_name", "full_name", "role_type", "lead_stage", "area", "tags", "consent_status"];
const inferImportMapping = (headers) => Object.fromEntries(IMPORT_FIELDS.map((field) => [field, headers.find((header) => header.toLowerCase().replace(/[^a-z]/g, "") === field.replace(/_/g, "")) || ""]));
const consentFromImport = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (["yes", "true", "opted in", "opted_in", "subscribed"].includes(v)) return "opted_in";
  if (["no", "false", "opted out", "opted_out", "unsubscribed"].includes(v)) return "opted_out";
  return "unknown";
};

function useCampaigns() {
  const { authState } = useAuthSession();
  const organisationId = getOrg(authState);
  const [state, setState] = useState({
    loading: true,
    error: "",
    campaigns: [],
    performance: [],
    identities: [],
    contacts: [],
    subscriptionTypes: [],
    deliverability: [],
    templates: [],
    savedAudiences: [],
    usage: [],
    billingProfile: null,
    dailyPerformance: [],
    categoryPerformance: [],
  });
  const refresh = async () => {
    if (!organisationId)
      return setState((s) => ({
        ...s,
        loading: false,
        error: "Choose an organisation workspace to use Email Campaigns.",
      }));
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      setState({
        loading: false,
        error: "",
        ...(await getEmailCampaignWorkspace(organisationId)),
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e.message || "Campaign data could not be loaded.",
      }));
    }
  };
  useEffect(() => {
    void refresh();
  }, [organisationId]);
  return {
    ...state,
    refresh,
    organisationId,
    userId: authState?.user?.id || "",
  };
}
function Status({ value }) {
  return (
    <span
      className={`wa-status ${value === "sent" ? "wa-status-sent" : value === "scheduled" ? "wa-status-upcoming" : value?.includes("failed") ? "wa-status-cancelled" : "email-status-draft"}`}
    >
      {String(value || "draft").replace("_", " ")}
    </span>
  );
}
function Stats({ campaigns, performance }) {
  const t = performance.reduce(
    (a, x) => ({
      recipients: a.recipients + Number(x.recipients || 0),
      delivered: a.delivered + Number(x.delivered || 0),
      opened: a.opened + Number(x.opened || 0),
      clicked: a.clicked + Number(x.clicked || 0),
    }),
    { recipients: 0, delivered: 0, opened: 0, clicked: 0 },
  );
  const items = [
    [
      Send,
      campaigns.filter((c) => c.status === "sent").length,
      "Sent this month",
      "Completed campaigns",
    ],
    [UsersRound, fmt(t.recipients), "Recipients", "Unique send records"],
    [
      MailOpen,
      rate(t.opened, t.delivered),
      "Open rate",
      "Indicative, privacy affected",
    ],
    [
      MousePointerClick,
      rate(t.clicked, t.delivered),
      "Click rate",
      "Delivered recipients",
    ],
  ];
  return (
    <section className="wa-stats">
      {items.map(([Icon, value, label, detail]) => (
        <article className="wa-stat email-stat" key={label}>
          <span className="wa-stat-icon">
            <Icon size={19} />
          </span>
          <span className="wa-stat-copy">
            <strong>{value}</strong>
            <span>{label}</span>
            <small>{detail}</small>
          </span>
        </article>
      ))}
    </section>
  );
}
function CampaignThumbnail({ campaign, compact = false }) {
  const source = campaignImage(campaign);
  return (
    <div
      className={`email-campaign-thumbnail ${compact ? "email-campaign-thumbnail-compact" : ""}`}
    >
      {source ? (
        <img src={source} alt="" />
      ) : (
        <>
          <Image size={compact ? 16 : 23} />
          <span>
            {String(campaign?.subject || campaign?.name || "Campaign").slice(
              0,
              1,
            )}
          </span>
        </>
      )}
    </div>
  );
}
function LandingMetrics({ campaigns, performance }) {
  const totals = performance.reduce(
    (all, metric) => ({
      recipients: all.recipients + Number(metric.recipients || 0),
      delivered: all.delivered + Number(metric.delivered || 0),
      clicked: all.clicked + Number(metric.clicked || 0),
    }),
    { recipients: 0, delivered: 0, clicked: 0 },
  );
  const items = [
    [
      Send,
      campaigns.filter((campaign) => campaign.status === "sent").length || "—",
      "Campaigns sent",
      "Completed campaigns",
    ],
    [
      UsersRound,
      totals.recipients || "—",
      "Recipients",
      totals.recipients ? "Unique send records" : "No sent campaigns",
    ],
    [
      Mail,
      rate(totals.delivered, totals.recipients),
      "Delivery rate",
      totals.recipients ? "Successfully delivered" : "Insufficient data",
    ],
    [
      MousePointerClick,
      rate(totals.clicked, totals.delivered),
      "Click rate",
      totals.delivered ? "Unique engagement" : "Insufficient data",
    ],
  ];
  return (
    <section className="email-landing-metrics">
      {items.map(([Icon, value, label, detail]) => (
        <article key={label}>
          <span>
            <Icon size={20} />
          </span>
          <div>
            <small>{label}</small>
            <strong>{typeof value === "number" ? fmt(value) : value}</strong>
            <p>{detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
function TrustPanel({ identities, deliverability, organisationId, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const verified = identities.filter(
    (identity) => identity.verification_status === "verified",
  ).length;
  const health = deliverability.some((item) => item.health_status === "paused")
    ? "paused"
    : deliverability.some((item) => item.health_status === "warning")
      ? "warning"
      : deliverability.length
        ? "healthy"
        : "warming";
  const refresh = async () => {
    setBusy(true);
    try {
      const result = await refreshEmailSenderVerification(organisationId);
      setNotice(
        `${result.verified} of ${result.checked} sender domains verified.`,
      );
      await onRefresh();
    } catch (error) {
      setNotice(error.message || "Unable to refresh sender status.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="email-trust-panel">
      <div>
        <span className="email-eyebrow">DELIVERABILITY CONTROL</span>
        <h3>
          {verified
            ? `${verified} verified sender${verified === 1 ? "" : "s"}`
            : "No verified sender"}
        </h3>
        <p>
          Purpose-specific consent, global suppression and provider events are
          enforced before each delivery.
        </p>
      </div>
      <div className="email-trust-actions">
        <Status value={health} />
        <button
          type="button"
          className="wa-secondary-button"
          disabled={busy || !identities.length}
          onClick={() => void refresh()}
        >
          {busy ? "Checking…" : "Refresh domain status"}
        </button>
        {notice && <small>{notice}</small>}
      </div>
    </section>
  );
}
function UsagePanel({ usage, billingProfile }) {
  const recipients = usage.reduce(
    (sum, record) => sum + Number(record.recipient_count || 0),
    0,
  );
  const charged = usage.reduce(
    (sum, record) => sum + Number(record.wallet_charge || 0),
    0,
  );
  const currency =
    billingProfile?.currency || usage[0]?.pricing_snapshot?.currency || "ZAR";
  return (
    <section className="email-usage-panel">
      <div>
        <span className="email-eyebrow">USAGE & BILLING</span>
        <h3>{fmt(recipients)} campaign emails recorded</h3>
        <p>
          Billing adapter:{" "}
          <strong>{billingProfile?.adapter_key || "no_charge"}</strong>. Charges
          are disabled in this release.
        </p>
      </div>
      <div className="email-usage-amount">
        <strong>
          {new Intl.NumberFormat("en-ZA", {
            style: "currency",
            currency,
          }).format(charged)}
        </strong>
        <small>charged to wallet</small>
      </div>
    </section>
  );
}
function InsightsPanel({ dailyPerformance, categoryPerformance }) {
  const days = [...dailyPerformance].slice(0, 7).reverse();
  const max = Math.max(1, ...days.map((day) => Number(day.recipients || 0)));
  const category = categoryPerformance[0];
  const total = dailyPerformance.reduce(
    (sum, day) => ({
      recipients: sum.recipients + Number(day.recipients || 0),
      delivered: sum.delivered + Number(day.delivered || 0),
      bounced: sum.bounced + Number(day.bounced || 0),
      unsubscribed: sum.unsubscribed + Number(day.unsubscribed || 0),
    }),
    { recipients: 0, delivered: 0, bounced: 0, unsubscribed: 0 },
  );
  const signal = total.recipients
    ? total.bounced / total.recipients > 0.05
      ? "Bounce rate needs attention"
      : total.unsubscribed / total.recipients > 0.02
        ? "Unsubscribe trend needs attention"
        : "Deliverability is within guardrails"
    : "Send a campaign to unlock trend intelligence";
  return (
    <section className="email-insights">
      <div className="email-insights-head">
        <div>
          <span className="email-eyebrow">PERFORMANCE INTELLIGENCE</span>
          <h3>{signal}</h3>
          <p>
            {category
              ? `${category.subscription_type} is currently your highest-volume category.`
              : "Performance will appear once recipient events arrive."}
          </p>
        </div>
        <div className="email-insight-kpis">
          <strong>{rate(total.delivered, total.recipients)}</strong>
          <small>delivery rate</small>
        </div>
      </div>
      <div className="email-trend-chart">
        {days.length ? (
          days.map((day) => (
            <div className="email-trend-day" key={day.metric_date}>
              <span
                style={{
                  height: `${Math.max(6, Math.round((Number(day.recipients || 0) * 100) / max))}%`,
                }}
                title={`${fmt(day.recipients)} recipients`}
              />
              <small>
                {new Date(`${day.metric_date}T00:00:00Z`).toLocaleDateString(
                  undefined,
                  { weekday: "narrow" },
                )}
              </small>
            </div>
          ))
        ) : (
          <p>No sent campaign data yet.</p>
        )}
      </div>
      <div className="email-category-list">
        {categoryPerformance.slice(0, 3).map((item) => (
          <div key={item.subscription_type_id}>
            <span>{item.subscription_type}</span>
            <strong>{rate(item.clicked, item.delivered)} click rate</strong>
          </div>
        ))}
      </div>
      <small className="email-insight-note">
        Open rates remain indicative because privacy tools can distort opens.
      </small>
    </section>
  );
}
const PROPERTY_TEMPLATE_STARTERS = [
  { id: "listing", name: "New listing", category: "listing", html: '<table role="presentation" width="100%" style="font-family:Arial,sans-serif;background:#f5f7f5;padding:28px"><tr><td align="center"><table role="presentation" width="620" style="max-width:620px;background:#fff"><tr><td style="padding:38px;color:#123b2d"><p style="letter-spacing:2px;font-size:11px">NEW LISTING</p><h1 style="font-size:34px;margin:0">A home worth seeing</h1><p style="color:#557166">Discover a considered property opportunity from {{agency_name}}.</p><a href="#" style="display:inline-block;background:#087a52;color:#fff;padding:13px 20px;text-decoration:none">View listing</a></td></tr></table></td></tr></table>' },
  { id: "market", name: "Market update", category: "market_update", html: '<table role="presentation" width="100%" style="font-family:Arial,sans-serif;background:#f6f5f1;padding:28px"><tr><td align="center"><table role="presentation" width="620" style="max-width:620px;background:#fff"><tr><td style="padding:38px;color:#18324a"><p style="letter-spacing:2px;font-size:11px">LOCAL INTELLIGENCE</p><h1 style="font-size:34px;margin:0">Your market, in focus</h1><p style="color:#5e7185">A concise update on what is moving in your area.</p><a href="#" style="display:inline-block;background:#18324a;color:#fff;padding:13px 20px;text-decoration:none">Read the update</a></td></tr></table></td></tr></table>' },
  { id: "event", name: "Open house", category: "announcement", html: '<table role="presentation" width="100%" style="font-family:Arial,sans-serif;background:#f2f8f5;padding:28px"><tr><td align="center"><table role="presentation" width="620" style="max-width:620px;background:#fff"><tr><td style="padding:38px;color:#113a2d"><p style="letter-spacing:2px;font-size:11px">YOU ARE INVITED</p><h1 style="font-size:34px;margin:0">Open house this weekend</h1><p style="color:#557166">Meet the agent, tour the home and ask the questions that matter.</p><a href="#" style="display:inline-block;background:#087a52;color:#fff;padding:13px 20px;text-decoration:none">Reserve a viewing</a></td></tr></table></td></tr></table>' },
];
const VISUAL_EMAIL_BLOCKS = [
  { id: "heading", label: "Heading", html: '<h2 style="color:#173b2e;font-family:Arial,sans-serif;font-size:28px;margin:24px 0 10px">Add a clear headline</h2>' },
  { id: "copy", label: "Text", html: '<p style="color:#526b5d;font-family:Arial,sans-serif;font-size:16px;line-height:1.6">Add your message here.</p>' },
  { id: "button", label: "Button", html: '<a href="#" style="background:#087a52;color:#fff;display:inline-block;font-family:Arial,sans-serif;padding:13px 20px;text-decoration:none">Call to action</a>' },
  { id: "divider", label: "Divider", html: '<hr style="border:0;border-top:1px solid #dce8e1;margin:28px 0" />' },
];
const PERSONALISATION_TOKENS = ["first_name", "full_name", "area", "role_type", "agent_name", "agency_name"];

function TemplateStudio({
  html,
  onChange,
  templates,
  imageAssets,
  organisationId,
  userId,
  onRefresh,
  busy,
  setNotice,
  setError,
}) {
  const [templateName, setTemplateName] = useState("");
  const [starterId, setStarterId] = useState("");
  const [visualBlocks, setVisualBlocks] = useState([]);
  const [listing, setListing] = useState({ title: "", area: "", price: "", imageUrl: "", link: "" });
  const [saving, setSaving] = useState(false);
  const input = useRef(null);
  const imageInput = useRef(null);
  const compatibility = useMemo(() => inspectEmailHtml(html), [html]);
  const applyTemplate = (template) => {
    onChange(template.html || "");
    setNotice(`Applied “${template.name}”. Review the preview before sending.`);
  };
  const applyStarter = (starter) => {
    setStarterId(starter.id);
    onChange(starter.html);
    setNotice(`Started with “${starter.name}”. Personalise the copy, links and images before sending.`);
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html")
      return setError("Choose an .html or .htm file.");
    if (file.size > 750 * 1024)
      return setError("HTML uploads must be smaller than 750 KB.");
    try {
      const content = await file.text();
      if (!content.trim()) throw new Error("That HTML file is empty.");
      onChange(content);
      const report = inspectEmailHtml(content);
      setNotice(report.ready ? `Loaded ${file.name}. Compatibility score: ${report.score}/100.` : `Loaded ${file.name}, but ${report.blockers} unsafe construct${report.blockers === 1 ? "" : "s"} will be stripped before delivery.`);
    } catch (error) {
      setError(error.message || "Unable to read that HTML file.");
    }
  };
  const uploadImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { const asset = await uploadEmailImageAsset({ organisationId, userId, file }); onChange(`${html}\n<img src="${asset.public_url}" alt="${asset.alt_text || ""}" style="max-width:100%;height:auto" />`); setNotice(`${asset.file_name} added to your asset library and email.`); await onRefresh(); } catch (error) { setError(error.message || "Unable to upload image."); }
  };
  const insertAsset = (asset) => { onChange(`${html}\n<img src="${asset.public_url}" alt="${asset.alt_text || ""}" style="max-width:100%;height:auto" />`); setNotice(`${asset.file_name} inserted into the email.`); };
  const insertListingCard = () => {
    if (!listing.title || !listing.link) return setError("Add a listing title and destination link first.");
    const title = escapeEmailText(listing.title), area = escapeEmailText(listing.area), price = escapeEmailText(listing.price), image = escapeEmailText(listing.imageUrl), link = escapeEmailText(listing.link);
    onChange(`${html}<table role="presentation" width="100%" style="margin:20px 0;border:1px solid #dce8e1"><tr>${image ? `<td style="width:42%"><img src="${image}" alt="${title}" style="display:block;width:100%;height:auto" /></td>` : ""}<td style="padding:22px;color:#173b2e"><h2 style="margin:0 0 8px;font-size:22px">${title}</h2><p style="margin:0 0 8px;color:#61796d">${area}</p><p style="margin:0 0 16px;font-weight:bold">${price}</p><a href="${link}" style="color:#087a52;font-weight:bold">View property →</a></td></tr></table>`);
    setNotice("Property card inserted. Review the live preview before sending.");
  };
  const insertVisualBlock = (block) => { setVisualBlocks((current) => [...current, block.id]); onChange(`${html}\n${block.html}`); setNotice(`${block.label} block inserted. Click into the advanced editor to personalise it.`); };
  const insertToken = (token) => { onChange(`${html}{{${token}}}`); setNotice(`Inserted ${token.replaceAll("_", " ")} personalisation.`); };
  const insertConditional = (role) => { onChange(`${html}\n{{#if role_type=${role}}}<p style="font-family:Arial,sans-serif;color:#526b5d">Add a message specifically for ${role}s.</p>{{/if}}`); setNotice(`Added content visible only to ${role}s.`); };
  const saveTemplate = async () => {
    setSaving(true);
    setError("");
    try {
      await saveEmailTemplate({
        organisationId,
        userId,
        template: {
          name: templateName || "Untitled template",
          html,
          category: PROPERTY_TEMPLATE_STARTERS.find((starter) => starter.id === starterId)?.category || "custom",
          designJson: { source: starterId ? "property_starter" : "html_upload", starter_id: starterId || null, schema_version: 1 },
        },
      });
      setTemplateName("");
      setNotice("Template saved to your agency library.");
      await onRefresh();
    } catch (error) {
      setError(error.message || "Unable to save this template.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="email-template-studio">
      <div className="email-template-heading">
        <span className="email-eyebrow">
          <LayoutTemplate size={13} /> TEMPLATE LIBRARY
        </span>
        <p>
          Start from an agency-approved layout or import production HTML.
          Campaigns retain their own immutable content snapshot when sending
          begins.
        </p>
      </div>
      <div className="email-template-actions">
        <select
          defaultValue=""
          onChange={(event) => {
            const template = templates.find(
              (item) => item.id === event.target.value,
            );
            if (template) applyTemplate(template);
            event.target.value = "";
          }}
        >
          <option value="">Apply a saved template…</option>
          {templates.map((template) => (
            <option value={template.id} key={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <input
          ref={input}
          type="file"
          accept=".html,.htm,text/html"
          hidden
          onChange={(event) => void upload(event)}
        />
        <button
          className="wa-secondary-button"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <FileUp size={15} /> Upload HTML
        </button>
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadImage(event)} />
        <button className="wa-secondary-button" type="button" disabled={busy} onClick={() => imageInput.current?.click()}><Image size={15} /> Upload image</button>
      </div>
      {imageAssets.length > 0 && <div className="email-image-assets">{imageAssets.slice(0, 8).map((asset) => <button type="button" key={asset.id} title={`Insert ${asset.file_name}`} onClick={() => insertAsset(asset)}><img src={asset.public_url} alt={asset.alt_text || asset.file_name} /></button>)}</div>}
      <div className="email-listing-block"><strong>Property card</strong><div><input value={listing.title} onChange={(event) => setListing({ ...listing, title: event.target.value })} placeholder="Listing title" /><input value={listing.area} onChange={(event) => setListing({ ...listing, area: event.target.value })} placeholder="Area" /><input value={listing.price} onChange={(event) => setListing({ ...listing, price: event.target.value })} placeholder="Price" /><input value={listing.imageUrl} onChange={(event) => setListing({ ...listing, imageUrl: event.target.value })} placeholder="Image URL (optional)" /><input value={listing.link} onChange={(event) => setListing({ ...listing, link: event.target.value })} placeholder="Listing URL" /><button type="button" className="wa-secondary-button" onClick={insertListingCard}>Insert card</button></div></div>
      <div className={`email-html-compatibility ${compatibility.ready ? "is-ready" : "has-blockers"}`}><strong>HTML compatibility {compatibility.score}/100</strong><span>{compatibility.images} image{compatibility.images === 1 ? "" : "s"} · {compatibility.missingAlt} missing alt text · {compatibility.warnings} client-rendering warning{compatibility.warnings === 1 ? "" : "s"}</span>{!compatibility.ready && <small>{compatibility.blockers} unsafe construct{compatibility.blockers === 1 ? "" : "s"} will be removed before delivery.</small>}</div>
      <div className="email-template-starters" aria-label="Property marketing template starters">
        {PROPERTY_TEMPLATE_STARTERS.map((starter) => <button type="button" className={starterId === starter.id ? "is-active" : ""} onClick={() => applyStarter(starter)} key={starter.id}><span>{starter.category.replace("_", " ")}</span><strong>{starter.name}</strong><small>Start editing</small></button>)}
      </div>
      <div className="email-visual-blocks"><div><strong>Visual blocks</strong><small>Build without starting from code</small></div><span>{VISUAL_EMAIL_BLOCKS.map((block) => <button type="button" key={block.id} onClick={() => insertVisualBlock(block)}>+ {block.label}</button>)}</span>{visualBlocks.length > 0 && <small>{visualBlocks.length} block{visualBlocks.length === 1 ? "" : "s"} added</small>}</div>
      <div className="email-personalisation"><div><strong>Personalise each send</strong><small>Insert recipient and agency details, or show a block only to a role.</small></div><span>{PERSONALISATION_TOKENS.map((token) => <button type="button" key={token} onClick={() => insertToken(token)}>{`{{${token}}}`}</button>)}</span><span>{["buyer", "seller", "investor"].map((role) => <button type="button" key={role} onClick={() => insertConditional(role)}>If {role}</button>)}</span></div>
      <div className="email-template-save">
        <input
          value={templateName}
          onChange={(event) => setTemplateName(event.target.value)}
          placeholder="Save current layout as…"
          aria-label="Template name"
        />
        <button
          className="wa-secondary-button"
          type="button"
          disabled={saving || busy || !html.trim()}
          onClick={() => void saveTemplate()}
        >
          <Save size={15} /> {saving ? "Saving…" : "Save template"}
        </button>
      </div>
    </section>
  );
}
function AudienceStudio({
  audienceFilter,
  onChange,
  contacts,
  savedAudiences,
  contactTags,
  organisationId,
  userId,
  onRefresh,
  setNotice,
  setError,
}) {
  const [audienceName, setAudienceName] = useState("");
  const [audienceKind, setAudienceKind] = useState("dynamic");
  const [enquiryType, setEnquiryType] = useState("");
  const [minimumEnquiryPrice, setMinimumEnquiryPrice] = useState("");
  const [tagName, setTagName] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key, value) => onChange({ ...audienceFilter, [key]: value });
  const apply = (id) => {
    const audience = savedAudiences.find((item) => item.id === id);
    if (audience) {
      const memberIds = (audience.email_saved_audience_members || []).map((member) => member.contact_id);
      onChange(audience.audience_kind === "static" ? { contact_ids: memberIds, audience_id: audience.id } : audience.filter_json || {});
      setNotice(`Applied “${audience.name}”.`);
    }
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveEmailAudience({
        organisationId,
        userId,
        audience: {
          name: audienceName || "Untitled audience",
          filterJson: audienceFilter,
          audienceKind,
          memberIds: audienceKind === "static" ? audienceFilter.contact_ids || [] : [],
        },
      });
      setAudienceName("");
      setNotice(
        "Audience saved for your agency. Consent and suppression remain live checks.",
      );
      await onRefresh();
    } catch (error) {
      setError(error.message || "Unable to save this audience.");
    } finally {
      setSaving(false);
    }
  };
  const searchableContacts = contacts.filter((contact) =>
    (!enquiryType || String(contact.enquiry_property_type || "").toLowerCase() === enquiryType) &&
    (!minimumEnquiryPrice || Number(contact.highest_enquiry_price || 0) >= Number(minimumEnquiryPrice)),
  );
  const saveTag = async () => {
    try { await createEmailContactTag({ organisationId, userId, name: tagName }); setTagName(""); setNotice("Tag created for this agency."); await onRefresh(); } catch (error) { setError(error.message || "Unable to create tag."); }
  };
  const applyTag = async () => {
    if (!selectedTagId || !(audienceFilter.contact_ids || []).length) return setError("Select a tag and at least one client first.");
    try { const count = await assignEmailContactTag({ contactIds: audienceFilter.contact_ids, tagId: selectedTagId }); setNotice(`Tag applied to ${count} client${count === 1 ? "" : "s"}.`); await onRefresh(); } catch (error) { setError(error.message || "Unable to apply tag."); }
  };
  return (
    <section className="email-audience-studio">
      <div className="email-template-heading">
        <span className="email-eyebrow">
          <SlidersHorizontal size={13} /> AUDIENCE BUILDER
        </span>
        <p>
          Build a reusable dynamic CRM segment or a curated hand-picked list. Saved
          audiences never bypass consent, suppression or deduplication.
        </p>
      </div>
      <div className="email-template-actions">
        <select
          defaultValue=""
          onChange={(event) => {
            apply(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">Apply a saved audience…</option>
          {savedAudiences.map((audience) => (
            <option value={audience.id} key={audience.id}>
              {audience.name}
            </option>
          ))}
        </select>
        <input
          value={audienceName}
          onChange={(event) => setAudienceName(event.target.value)}
          placeholder="Save these filters as…"
          aria-label="Audience name"
        />
        <select value={audienceKind} onChange={(event) => setAudienceKind(event.target.value)} aria-label="Audience type">
          <option value="dynamic">Dynamic list</option>
          <option value="static">Curated list</option>
        </select>
        <button
          type="button"
          className="wa-secondary-button"
          disabled={saving}
          onClick={() => void save()}
        >
          <Save size={15} /> {saving ? "Saving…" : "Save audience"}
        </button>
      </div>
      <div className="email-audience-filters">
        <label className="wa-field-label">
          <span>Agency tags <small>Reuse in any audience</small></span>
          <div className="email-tag-manager"><input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="e.g. luxury-buyer" /><button type="button" className="wa-secondary-button" onClick={() => void saveTag()}>Add tag</button></div>
        </label>
        <label className="wa-field-label">
          <span>Contact type</span>
          <select
            value={audienceFilter.role_type || ""}
            onChange={(event) => set("role_type", event.target.value)}
          >
            <option value="">Any contact type</option>
            {["lead", "buyer", "seller", "landlord", "tenant"].map((value) => (
              <option value={value} key={value}>
                {value}s
              </option>
            ))}
          </select>
        </label>
        <label className="wa-field-label">
          <span>Area</span>
          <input
            value={audienceFilter.area || ""}
            onChange={(event) => set("area", event.target.value)}
            placeholder="e.g. Sandton"
          />
        </label>
        <label className="wa-field-label">
          <span>Tag</span>
          <input
            value={audienceFilter.tag || ""}
            onChange={(event) => set("tag", event.target.value)}
            placeholder="e.g. investor"
          />
        </label>
        <label className="wa-field-label">
          <span>Enquired property type <small>Curated search</small></span>
          <select value={enquiryType} onChange={(event) => setEnquiryType(event.target.value)}>
            <option value="">Any type</option>
            {['unit', 'apartment', 'house', 'townhouse', 'land'].map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="wa-field-label">
          <span>Minimum enquiry price <small>Curated search</small></span>
          <input type="number" min="0" value={minimumEnquiryPrice} onChange={(event) => setMinimumEnquiryPrice(event.target.value)} placeholder="e.g. 5000000" />
        </label>
        <label className="wa-field-label email-contact-picker">
          <span>
            Specific contacts <small>Optional</small>
          </span>
          <select
            multiple
            value={audienceFilter.contact_ids || []}
            onChange={(event) =>
              set(
                "contact_ids",
                [...event.target.selectedOptions].map((option) => option.value),
              )
            }
          >
            {searchableContacts.map((contact) => (
              <option value={contact.id} key={contact.id}>
                {contact.full_name || contact.email} · {contact.email}
              </option>
            ))}
          </select>
          <small>{searchableContacts.length} matching clients. Hold ⌘/Ctrl to select more than one for a curated list.</small>
        </label>
        <div className="email-tag-apply"><select value={selectedTagId} onChange={(event) => setSelectedTagId(event.target.value)}><option value="">Apply a saved tag…</option>{contactTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><button type="button" className="wa-secondary-button" onClick={() => void applyTag()}>Tag selected clients</button></div>
      </div>
    </section>
  );
}

export function EmailCampaignPlanning({ onBack }) {
  const { organisationId, campaigns, refresh } = useCampaigns();
  const [approvals, setApprovals] = useState([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    try { setApprovals(await getEmailCampaignApprovals(organisationId)); }
    catch (cause) { setError(cause.message || "Approval activity could not be loaded."); }
  }, [organisationId]);
  useEffect(() => { if (organisationId) void load(); }, [organisationId, load]);
  const decide = async (campaignId, decision) => {
    setBusyId(campaignId); setError(""); setNotice("");
    try {
      await setEmailCampaignApproval({ campaignId, decision, comment });
      await Promise.all([refresh(), load()]); setComment("");
      setNotice(decision === "requested" ? "Approval requested." : decision === "approved" ? "Campaign approved and ready to schedule." : "Changes requested from the campaign owner.");
    } catch (cause) { setError(cause.message || "Approval could not be updated."); }
    finally { setBusyId(""); }
  };
  const awaiting = campaigns.filter((campaign) => campaign.approval_required && ["draft", "requested", "changes_requested"].includes(campaign.approval_status));
  const upcoming = campaigns.filter((campaign) => campaign.status === "scheduled" || (campaign.status === "draft" && campaign.scheduled_for)).sort((a, b) => new Date(a.scheduled_for || 8640000000000000) - new Date(b.scheduled_for || 8640000000000000));
  return <div className="email-workspace">
    <header className="email-page-header"><button type="button" className="email-back-button" onClick={onBack}><ArrowLeft size={17} /> Email campaigns</button><span className="email-eyebrow">PLANNING</span><h1>Campaign calendar & approvals</h1><p>Keep every launch visible, and make the final send decision accountable.</p></header>
    <div className="email-planning-grid"><section className="email-form-card"><div className="email-review-heading"><div><span className="email-eyebrow">APPROVAL QUEUE</span><h2><ShieldCheck size={20} /> Ready for review</h2></div><strong>{awaiting.length}</strong></div><label className="wa-field-label"><span>Decision note <small>Optional</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What should the owner know?" maxLength="2000" /></label><div className="email-approval-list">{awaiting.map((campaign) => <article key={campaign.id}><div><strong>{campaign.name}</strong><span>{campaign.subject}</span><small>{campaign.approval_status.replaceAll("_", " ")}</small></div><div className="email-approval-actions">{campaign.approval_status !== "requested" && <button type="button" className="wa-secondary-button" disabled={busyId === campaign.id} onClick={() => void decide(campaign.id, "requested")}>Request review</button>}{campaign.approval_status === "requested" && <><button type="button" className="wa-secondary-button" disabled={busyId === campaign.id} onClick={() => void decide(campaign.id, "changes_requested")}>Request changes</button><button type="button" className="email-create-button" disabled={busyId === campaign.id} onClick={() => void decide(campaign.id, "approved")}>Approve</button></>}</div></article>)}{!awaiting.length && <p className="wa-empty">No campaigns are awaiting approval.</p>}</div></section><aside className="email-form-card"><div className="email-review-heading"><div><span className="email-eyebrow">SEND CALENDAR</span><h2><CalendarDays size={20} /> Upcoming sends</h2></div></div><div className="email-calendar-list">{upcoming.map((campaign) => <article key={campaign.id}><time>{stamp(campaign.scheduled_for)}</time><strong>{campaign.name}</strong><span>{campaign.subject}</span><Status value={campaign.status} /></article>)}{!upcoming.length && <p className="wa-empty">No future campaign sends are scheduled.</p>}</div></aside></div>
    {approvals.length > 0 && <section className="email-form-card email-approval-history"><span className="email-eyebrow">RECENT DECISIONS</span>{approvals.slice(0, 6).map((approval) => <p key={approval.id}><strong>{approval.decision.replaceAll("_", " ")}</strong><span>{approval.comment || "No note added"}</span><time>{stamp(approval.created_at)}</time></p>)}</section>}
    {error && <p className="wa-error">{error}</p>}{notice && <p className="wa-notice">{notice}</p>}
  </div>;
}

export function EmailAudienceImportStudio({ onBack }) {
  const { organisationId, userId } = useCampaigns();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const prepared = useMemo(() => rawRows.map((row) => {
    const value = (field) => row[headers.indexOf(mapping[field])] || "";
    return {
      email: String(value("email")).trim().toLowerCase(), first_name: value("first_name"), last_name: value("last_name"), full_name: value("full_name"),
      role_type: value("role_type"), lead_stage: value("lead_stage"), area: value("area"),
      tags: String(value("tags")).split(/[;,]/).map((tag) => tag.trim()).filter(Boolean), consent_status: consentFromImport(value("consent_status")),
    };
  }).filter((row) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)), [rawRows, headers, mapping]);
  const rejectedCount = rawRows.length - prepared.length;
  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setNotice("");
    if (file.size > 1024 * 1024) { setError("Choose a CSV file smaller than 1 MB."); return; }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) { setError("This CSV needs a header row and at least one contact."); return; }
    setFileName(file.name); setHeaders(parsed[0]); setRawRows(parsed.slice(1, 501)); setMapping(inferImportMapping(parsed[0]));
    if (parsed.length > 501) setNotice("Only the first 500 data rows are loaded. Import the remaining contacts in another file.");
  };
  const runImport = async () => {
    setError(""); setNotice(""); setImporting(true);
    try {
      const result = await importEmailAudience({ organisationId, userId, fileName, totalRows: rawRows.length, rejectedRows: rejectedCount, mapping, rows: prepared });
      setNotice(`${result.accepted_rows} contacts imported. ${rejectedCount ? `${rejectedCount} rows were skipped because their email was invalid.` : ""}`);
    } catch (cause) { setError(cause.message || "The contacts could not be imported."); }
    finally { setImporting(false); }
  };
  return <div className="email-workspace">
    <header className="email-page-header"><button type="button" className="email-back-button" onClick={onBack}><ArrowLeft size={17} /> Email campaigns</button><span className="email-eyebrow">AUDIENCE</span><h1>Import contacts safely</h1><p>Preview the file, map its columns, and preserve each client’s marketing consent.</p></header>
    <section className="email-form-card email-import-card">
      <div className="email-review-heading"><div><span className="email-eyebrow">CSV IMPORT</span><h2><FileUp size={20} /> Review before adding contacts</h2></div></div>
      <label className="email-import-drop"><FileUp size={23} /><strong>{fileName || "Choose a CSV file"}</strong><span>Up to 500 contacts per import · 1 MB maximum</span><input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} /></label>
      {!!headers.length && <><div className="email-import-mapping">{IMPORT_FIELDS.map((field) => <label className="wa-field-label" key={field}><span>{field.replaceAll("_", " ")}{field === "email" && " *"}</span><select value={mapping[field] || ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}><option value="">Do not import</option>{headers.map((header) => <option value={header} key={header}>{header}</option>)}</select></label>)}</div>
      <div className="email-import-preview"><strong>{prepared.length} valid contacts ready</strong><span>{rejectedCount} invalid emails will be skipped</span><small>Existing contacts are matched by email. A prior opt-out is never changed by this import.</small></div>
      <div className="email-import-table"><div><span>Email</span><span>Name</span><span>Consent</span></div>{prepared.slice(0, 5).map((row, index) => <div key={`${row.email}-${index}`}><span>{row.email}</span><span>{row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "—"}</span><span>{row.consent_status.replace("_", " ")}</span></div>)}</div></>}
      {error && <p className="wa-error">{error}</p>}{notice && <p className="wa-notice">{notice}</p>}
      <div className="wa-form-footer"><button type="button" className="wa-secondary-button" onClick={onBack}>Cancel</button><button type="button" className="email-create-button" disabled={importing || !prepared.length || !mapping.email} onClick={() => void runImport()}><FileUp size={17} /> {importing ? "Importing…" : `Import ${prepared.length || ""} contacts`}</button></div>
    </section>
  </div>;
}

export function EmailAutomationStudio({ onBack }) {
  const { loading, error, campaigns, contacts, organisationId, userId } = useCampaigns();
  const [journeys, setJourneys] = useState([]);
  const [name, setName] = useState("");
  const [triggerKey, setTriggerKey] = useState("listing_enquiry");
  const [delayMinutes, setDelayMinutes] = useState("60");
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [manualJourneyId, setManualJourneyId] = useState("");
  const [manualContactId, setManualContactId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const eligibleCampaigns = campaigns.filter(
    (campaign) => campaign.status === "draft" || campaign.status === "scheduled",
  );

  const loadJourneys = useCallback(async () => {
    if (!organisationId) return;
    try {
      setJourneys(await getEmailAutomationJourneys(organisationId));
    } catch (cause) {
      setSaveError(cause.message || "The journeys could not be loaded.");
    }
  }, [organisationId]);

  useEffect(() => { void loadJourneys(); }, [loadJourneys]);

  const save = async () => {
    setNotice("");
    setSaveError("");
    setSaving(true);
    try {
      await saveEmailAutomation({
        organisationId,
        userId,
        journey: {
          name,
          triggerKey,
          steps: [
            { type: "delay", delayMinutes: Number(delayMinutes) },
            { type: "campaign", campaignId },
          ],
        },
      });
      setNotice("Journey saved as a draft. Review its campaign before activation.");
      setName("");
      setCampaignId("");
      await loadJourneys();
    } catch (cause) {
      setSaveError(cause.message || "The journey could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const setJourneyStatus = async (journeyId, status) => {
    setNotice("");
    setSaveError("");
    setSaving(true);
    try {
      await setEmailAutomationJourneyStatus({ journeyId, status });
      setNotice(status === "active" ? "Journey activated. New matching events can now enrol eligible contacts." : "Journey paused. New events will not enrol contacts.");
      await loadJourneys();
    } catch (cause) {
      setSaveError(cause.message || "The journey status could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  const enrolClient = async () => {
    setNotice("");
    setSaveError("");
    setEnrolling(true);
    try {
      await enqueueEmailAutomationManualEvent({ journeyId: manualJourneyId, contactId: manualContactId });
      const contact = contacts.find((item) => item.id === manualContactId);
      setNotice(`${contact?.full_name || contact?.email || "Client"} has been queued for this journey. The worker will still apply all delivery safeguards.`);
      setManualContactId("");
      await loadJourneys();
    } catch (cause) {
      setSaveError(cause.message || "The client could not be enrolled.");
    } finally {
      setEnrolling(false);
    }
  };
  const activeManualJourneys = journeys.filter((journey) => journey.status === "active" && journey.trigger_key === "manual");

  return (
    <div className="email-workspace">
      <header className="email-page-header">
        <button type="button" className="email-back-button" onClick={onBack}>
          <ArrowLeft size={17} /> Email campaigns
        </button>
        <span className="email-eyebrow">AUTOMATION</span>
        <h1>Build a customer journey</h1>
        <p>
          Turn a meaningful client event into a considered, approved follow-up.
          Every journey starts as a draft.
        </p>
      </header>
      <section className="email-form-card email-automation-card">
        <div className="email-review-heading">
          <div>
            <span className="email-eyebrow">JOURNEY BLUEPRINT</span>
            <h2><Workflow size={20} /> Trigger, wait, send</h2>
          </div>
          <span className="wa-status email-status-draft">Draft only</span>
        </div>
        {loading ? <p className="wa-empty">Loading available campaigns…</p> : (
          <div className="email-automation-grid">
            <label className="wa-field-label email-automation-full">
              <span>Journey name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New enquiry follow-up" maxLength="120" />
            </label>
            <label className="wa-field-label">
              <span>When this happens</span>
              <select value={triggerKey} onChange={(event) => setTriggerKey(event.target.value)}>
                <option value="listing_enquiry">A client enquires on a listing</option>
                <option value="contact_created">A client is added</option>
                <option value="tag_added">A client receives a tag</option>
                <option value="price_reduction">A listing has a price reduction</option>
                <option value="manual">An agent enrols a client manually</option>
              </select>
            </label>
            <label className="wa-field-label">
              <span><Timer size={15} /> Wait before the follow-up</span>
              <input type="number" min="1" max="525600" value={delayMinutes} onChange={(event) => setDelayMinutes(event.target.value)} />
              <small>Minutes. Use 60 for a measured first response.</small>
            </label>
            <label className="wa-field-label email-automation-full">
              <span>Then send this approved campaign</span>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                <option value="">Choose a draft or scheduled campaign…</option>
                {eligibleCampaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name} · {campaign.subject}</option>)}
              </select>
              {!eligibleCampaigns.length && <small>Create a campaign first, then return here to attach it to this journey.</small>}
            </label>
          </div>
        )}
        <div className="email-automation-flow" aria-label="Journey flow preview">
          <span>Event</span><ChevronRight size={16} /><span>Wait {Number(delayMinutes || 0)} min</span><ChevronRight size={16} /><span>Send campaign</span>
        </div>
        <p className="email-automation-note">Drafts do not enrol contacts. Activation is restricted to a sending administrator and checks sender verification, consent category, campaign readiness, and any required approval.</p>
        {error && <p className="wa-error">{error}</p>}
        {saveError && <p className="wa-error">{saveError}</p>}
        {notice && <p className="wa-notice">{notice}</p>}
        <div className="wa-form-footer">
          <button type="button" className="wa-secondary-button" onClick={onBack}>Cancel</button>
          <button type="button" className="email-create-button" disabled={saving || loading || !name.trim() || !campaignId || Number(delayMinutes) < 1} onClick={() => void save()}>
            <Save size={17} /> {saving ? "Saving…" : "Save journey draft"}
          </button>
        </div>
      </section>
      <section className="email-form-card email-automation-card">
        <div className="email-review-heading"><div><span className="email-eyebrow">MANUAL ENROLMENT</span><h2><UsersRound size={20} /> Add one client to a journey</h2></div></div>
        <p className="email-automation-note">Use this for a considered, one-to-one follow-up. It queues an auditable event; it does not send an email from this screen.</p>
        <div className="email-automation-grid email-automation-enrolment">
          <label className="wa-field-label"><span>Active manual journey</span><select value={manualJourneyId} onChange={(event) => setManualJourneyId(event.target.value)}><option value="">Choose a journey…</option>{activeManualJourneys.map((journey) => <option key={journey.id} value={journey.id}>{journey.name}</option>)}</select></label>
          <label className="wa-field-label"><span>Opted-in client</span><select value={manualContactId} onChange={(event) => setManualContactId(event.target.value)}><option value="">Choose a client…</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name || contact.email} · {contact.email}</option>)}</select></label>
        </div>
        {!activeManualJourneys.length ? <p className="email-automation-note">Activate a journey with the “An agent enrols a client manually” trigger to use this control.</p> : null}
        <div className="wa-form-footer"><button type="button" className="email-create-button" disabled={enrolling || !manualJourneyId || !manualContactId} onClick={() => void enrolClient()}><UsersRound size={17} /> {enrolling ? "Queueing…" : "Queue client"}</button></div>
      </section>
      <section className="email-form-card email-automation-card">
        <div className="email-review-heading"><div><span className="email-eyebrow">LIVE CONTROL</span><h2><ShieldCheck size={20} /> Journey status</h2></div></div>
        {!journeys.length ? <p className="wa-empty">No journeys have been saved yet.</p> : <div className="email-automation-journeys">{journeys.map((journey) => {
          const health = journey.health || {};
          const sent = Number(health.sent || 0);
          const issueCount = Number(health.failed_enrolments || 0) + Number(health.failed_deliveries || 0) + Number(health.bounced || 0) + Number(health.complained || 0);
          return <div className="email-automation-journey" key={journey.id}><div className="email-automation-journey-head"><div><strong>{journey.name}</strong><small>{journey.trigger_key.replaceAll("_", " ")} · {(journey.email_automation_steps || []).length} steps · {health.last_enrolled_at ? `last enrolled ${stamp(health.last_enrolled_at)}` : "no enrolments yet"}</small></div><div><span className={`wa-status email-status-${journey.status}`}>{journey.status}</span>{journey.status === "draft" || journey.status === "paused" ? <button type="button" className="wa-secondary-button" disabled={saving} onClick={() => void setJourneyStatus(journey.id, "active")}>Activate</button> : null}{journey.status === "active" ? <button type="button" className="wa-secondary-button" disabled={saving} onClick={() => void setJourneyStatus(journey.id, "paused")}>Pause</button> : null}</div></div><div className="email-automation-metrics"><span><strong>{fmt(health.enrolled)}</strong> enrolled</span><span><strong>{fmt(health.in_progress)}</strong> in progress</span><span><strong>{fmt(sent)}</strong> sent</span><span><strong>{rate(health.opened, sent)}</strong> opened</span><span><strong>{rate(health.clicked, sent)}</strong> clicked</span><span><strong>{fmt(health.exited)}</strong> exited</span><span className={issueCount ? "email-automation-metric-alert" : ""}><strong>{fmt(issueCount)}</strong> needs attention</span></div>{Number(health.queued_deliveries || 0) > 0 ? <p className="email-automation-note">{fmt(health.queued_deliveries)} delivery{Number(health.queued_deliveries) === 1 ? " is" : "ies are"} queued for the next worker run.</p> : null}</div>;
        })}</div>}
      </section>
    </div>
  );
}

export function EmailCampaignOverview({ onCreateCampaign, onOpenCampaign, onOpenAutomations, onOpenImport, onOpenPlanning }) {
  const {
    loading,
    error,
    campaigns,
    performance,
    usage,
    billingProfile,
    dailyPerformance,
    refresh,
  } = useCampaigns();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState("all");
  const [filterStartedAt] = useState(() => Date.now());
  const [actionError, setActionError] = useState("");
  const metrics = useMemo(
    () => Object.fromEntries(performance.map((x) => [x.campaign_id, x])),
    [performance],
  );
  const counts = useMemo(
    () =>
      campaigns.reduce(
        (all, campaign) => ({
          ...all,
          all: all.all + 1,
          [campaign.status]: (all[campaign.status] || 0) + 1,
        }),
        { all: 0 },
      ),
    [campaigns],
  );
  const rows = campaigns.filter((campaign) => {
    const searchMatch =
      `${campaign.name} ${campaign.subject} ${campaign.preview_text || ""} ${campaign.audience_filter?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const eventDate =
      campaign.sent_at || campaign.scheduled_for || campaign.updated_at;
    const rangeMatch =
      dateRange === "all" ||
      (eventDate &&
        new Date(eventDate).getTime() >=
          filterStartedAt - Number(dateRange) * 86400000);
    return (
      (tab === "all" || campaign.status === tab) && searchMatch && rangeMatch
    );
  });
  const priority = campaigns
    .filter((campaign) => ["draft", "scheduled"].includes(campaign.status))
    .sort(
      (a, b) =>
        (a.status === "scheduled" ? -1 : 1) -
        (b.status === "scheduled" ? -1 : 1),
    )[0];
  const best = [...campaigns]
    .filter((campaign) => campaign.status === "sent")
    .sort(
      (a, b) =>
        Number(metrics[b.id]?.clicked || 0) -
        Number(metrics[a.id]?.clicked || 0),
    )[0];
  const totalUsage = usage.reduce(
    (sum, record) => sum + Number(record.recipient_count || 0),
    0,
  );
  const operate = async (event, action) => {
    event.stopPropagation();
    setActionError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setActionError(
        cause.message || "Campaign action could not be completed.",
      );
    }
  };
  const editCampaign = (campaignId) => onCreateCampaign({ campaignId });
  const starters = [
    {
      name: "New listing launch",
      subject: "A new home worth seeing",
      previewText: "Be first to discover this new listing.",
    },
    {
      name: "Open house invitation",
      subject: "You’re invited to our open house",
      previewText: "Join us for an exclusive viewing.",
    },
    {
      name: "Monthly market update",
      subject: "Your local property market update",
      previewText: "A concise read on what is moving in your area.",
    },
  ];
  return (
    <div className="email-landing">
      <header className="email-landing-header">
        <div>
          <span>MARKETING</span>
          <h1>Email campaigns</h1>
          <p>Create, schedule and measure every message from one place.</p>
        </div>
        <div className="email-landing-actions">
          <div className="email-credit-button">
            <WalletCards size={18} />
            <strong>{fmt(totalUsage)}</strong>
            <span>emails recorded</span>
            <small>
              {billingProfile?.billing_enabled ? "Credits" : "Billing inactive"}
            </small>
          </div>
          <button
            className="wa-secondary-button"
            type="button"
            onClick={onOpenAutomations}
          >
            <Workflow size={17} /> Automations
          </button>
          <button className="wa-secondary-button" type="button" onClick={onOpenPlanning}>
            <CalendarDays size={17} /> Plan & approvals
          </button>
          <button className="wa-secondary-button" type="button" onClick={onOpenImport}><FileUp size={17} /> Import contacts</button>
          <button
            className="email-create-button"
            type="button"
            onClick={() => onCreateCampaign()}
          >
            <Plus size={18} /> Create campaign
          </button>
        </div>
      </header>
      <LandingMetrics campaigns={campaigns} performance={performance} />
      {priority && (
        <section className="email-priority-card">
          <CampaignThumbnail campaign={priority} />
          <div className="email-priority-copy">
            <Status
              value={
                priority.status === "draft" ? "ready to send" : priority.status
              }
            />
            <h2>{priority.subject || priority.name}</h2>
            <p>
              {priority.preview_text ||
                "This campaign is ready for its final review."}
            </p>
            <div>
              <span>
                <UsersRound size={16} /> {fmt(metrics[priority.id]?.recipients)}{" "}
                recipients
              </span>
              <span>
                <CalendarClock size={16} /> {stamp(priority.scheduled_for)}
              </span>
            </div>
          </div>
          <div className="email-priority-actions">
            <button
              type="button"
              className="email-create-button"
              onClick={() => onOpenCampaign(priority.id)}
            >
              <Send size={16} /> Review &amp; send
            </button>
            <button type="button" onClick={() => editCampaign(priority.id)}>
              Edit campaign
            </button>
          </div>
        </section>
      )}
      <div className="email-dashboard-grid">
        <main className="email-library">
          <section className="email-library-header">
            <div>
              <h2>All campaigns</h2>
              <div className="email-library-tabs">
                {[
                  ["all", "All"],
                  ["draft", "Drafts"],
                  ["scheduled", "Scheduled"],
                  ["sending", "Sending"],
                  ["sent", "Sent"],
                  ["failed", "Failed"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    className={tab === value ? "is-active" : ""}
                    onClick={() => setTab(value)}
                    key={value}
                  >
                    {label}
                    <small>{counts[value] || 0}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="email-library-tools">
              <label>
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search campaigns"
                />
              </label>
              <button
                type="button"
                className={filterOpen ? 'is-active' : ''}
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
                title="Filter campaign library"
              >
                <Filter size={17} /> Filter
              </button>
              {filterOpen && (
                <label className="email-library-filter">
                  Date range
                  <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                    <option value="all">All time</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </label>
              )}
            </div>
          </section>
          {error && <p className="wa-error">{error}</p>}
          {actionError && <p className="wa-error">{actionError}</p>}
          {loading ? (
            <div className="email-library-loading">
              Loading your campaign library…
            </div>
          ) : rows.length ? (
            <div className="email-library-list">
              {rows.map((campaign) => {
                const metric = metrics[campaign.id] || {};
                return (
                  <article
                    className={`email-library-row status-${campaign.status}`}
                    key={campaign.id}
                    onClick={() => onOpenCampaign(campaign.id)}
                  >
                    <CampaignThumbnail campaign={campaign} compact />
                    <div className="email-library-subject">
                      <strong>{campaign.subject || campaign.name}</strong>
                      <p>
                        {campaign.preview_text || "No preview text added yet."}
                      </p>
                    </div>
                    <Status value={campaign.status} />
                    <div className="email-row-metric">
                      <strong>
                        {metric.recipients ? fmt(metric.recipients) : "—"}
                      </strong>
                      <span>recipients</span>
                    </div>
                    <div className="email-row-date">
                      <strong>
                        {stamp(campaign.sent_at || campaign.scheduled_for)}
                      </strong>
                    </div>
                    <div className="email-row-metric">
                      <strong>{rate(metric.opened, metric.delivered)}</strong>
                      <span>opens</span>
                    </div>
                    <div className="email-row-metric">
                      <strong>{rate(metric.clicked, metric.delivered)}</strong>
                      <span>clicks</span>
                    </div>
                    <details
                      className="email-row-menu"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <summary aria-label="Campaign actions">
                        <MoreHorizontal size={19} />
                      </summary>
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenCampaign(campaign.id)}
                        >
                          <Eye size={14} /> View campaign
                        </button>
                        <button type="button" onClick={() => editCampaign(campaign.id)}>
                          <FileUp size={14} /> Edit campaign
                        </button>
                        <button
                          type="button"
                          onClick={(event) =>
                            void operate(event, () =>
                              duplicateEmailCampaign(campaign.id),
                            )
                          }
                        >
                          <Copy size={14} /> Duplicate
                        </button>
                        {[
                          "draft",
                          "sent",
                          "partially_failed",
                          "failed",
                          "cancelled",
                        ].includes(campaign.status) && (
                          <button
                            type="button"
                            onClick={(event) =>
                              void operate(event, () =>
                                archiveEmailCampaign(campaign.id),
                              )
                            }
                          >
                            <Archive size={14} /> Archive
                          </button>
                        )}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
            <section className="email-first-campaign">
              <div>
                <Sparkles size={22} />
                <h2>Your first campaign starts here</h2>
                <p>
                  Create a branded email, select a consented audience, and
                  schedule it when you are ready.
                </p>
                <button
                  type="button"
                  className="email-create-button"
                  onClick={() => onCreateCampaign()}
                >
                  <Plus size={16} /> Create campaign
                </button>
              </div>
              <aside>
                {starters.map((starter) => (
                  <button
                    type="button"
                    onClick={() => onCreateCampaign(starter)}
                    key={starter.name}
                  >
                    <strong>{starter.name}</strong>
                    <span>{starter.previewText}</span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </aside>
            </section>
          )}
        </main>
        <aside className="email-performance-rail">
          <section>
            <div className="email-rail-heading">
              <h2>Performance</h2>
              <span>Last 30 days</span>
            </div>
            <div className="email-rail-total">
              <small>Emails sent</small>
              <strong>{fmt(totalUsage)}</strong>
            </div>
            <div className="email-rail-chart">
              {[...dailyPerformance]
                .slice(0, 8)
                .reverse()
                .map((day) => (
                  <span
                    key={day.metric_date}
                    style={{
                      height: `${Math.max(8, Math.min(100, Number(day.recipients || 0)))}%`,
                    }}
                  />
                ))}
              {!dailyPerformance.length && <p>No delivery data yet.</p>}
            </div>
            <div className="email-rail-breakdown">
              <span>
                Delivery{" "}
                <strong>
                  {rate(
                    performance.reduce(
                      (sum, item) => sum + Number(item.delivered || 0),
                      0,
                    ),
                    performance.reduce(
                      (sum, item) => sum + Number(item.recipients || 0),
                      0,
                    ),
                  )}
                </strong>
              </span>
              <span>
                Click{" "}
                <strong>
                  {rate(
                    performance.reduce(
                      (sum, item) => sum + Number(item.clicked || 0),
                      0,
                    ),
                    performance.reduce(
                      (sum, item) => sum + Number(item.delivered || 0),
                      0,
                    ),
                  )}
                </strong>
              </span>
            </div>
          </section>
          <section>
            {best ? (
              <>
                <div className="email-rail-heading">
                  <h2>Best performer</h2>
                </div>
                <div className="email-best">
                  <CampaignThumbnail campaign={best} compact />
                  <div>
                    <strong>{best.subject || best.name}</strong>
                    <Status value="sent" />
                  </div>
                </div>
                <div className="email-best-stats">
                  <strong>
                    {rate(
                      metrics[best.id]?.opened,
                      metrics[best.id]?.delivered,
                    )}
                    <small>open rate</small>
                  </strong>
                  <strong>
                    {rate(
                      metrics[best.id]?.clicked,
                      metrics[best.id]?.delivered,
                    )}
                    <small>click rate</small>
                  </strong>
                </div>
                <button
                  type="button"
                  className="email-rail-link"
                  onClick={() => setTab("sent")}
                >
                  View all sent campaigns <ArrowUpRight size={14} />
                </button>
              </>
            ) : (
              <>
                <h2>Best performer</h2>
                <p className="email-rail-empty">
                  Your strongest campaign will appear here once delivery data
                  arrives.
                </p>
              </>
            )}
          </section>
          <section className="email-tips">
            <span>
              <Sparkles size={16} /> Email tip
            </span>
            <h3>Lead with a clear reason to open</h3>
            <p>
              Keep the subject specific, helpful and comfortably under 60
              characters.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function CreateEmailCampaign({ onBack, initialDraft, campaignId }) {
  const {
    organisationId,
    userId,
    identities,
    contacts,
    subscriptionTypes,
    templates,
    imageAssets,
    savedAudiences,
    contactTags,
    campaigns,
    refresh,
  } = useCampaigns();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exactAudience, setExactAudience] = useState(null);
  const [audienceDetail, setAudienceDetail] = useState(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const [experimentSubject, setExperimentSubject] = useState("");
  const [draft, setDraft] = useState(() => ({
    name: "",
    subject: "",
    previewText: "",
    senderIdentityId: "",
    subscriptionTypeId: "",
    replyToEmail: "",
    audienceFilter: { role_type: "" },
    contentJson: { blocks: [] },
    approvalRequired: false,
    html: "<h1>Hello {{first_name}}</h1><p>Share your update here.</p>",
    ...(initialDraft || {}),
  }));
  const sender = identities.find((x) => x.id === draft.senderIdentityId);
  const audience = contacts.filter(
    (x) =>
      !draft.audienceFilter.role_type ||
      x.role_type === draft.audienceFilter.role_type,
  );
  const audienceKey = JSON.stringify(draft.audienceFilter);
  useEffect(() => {
    const existing = campaigns.find((campaign) => campaign.id === campaignId);
    if (!existing || draft.id === existing.id) return;
    setDraft((current) => ({
      ...current,
      id: existing.id,
      name: existing.name || "",
      subject: existing.subject || "",
      previewText: existing.preview_text || "",
      senderIdentityId: existing.sender_identity_id || "",
      subscriptionTypeId: existing.subscription_type_id || "",
      replyToEmail: existing.reply_to_email || "",
      audienceFilter: existing.audience_filter || { role_type: "" },
      contentJson: existing.content_json || { blocks: [] },
      approvalRequired: Boolean(existing.approval_required),
      html: existing.html || "",
    }));
  }, [campaignId, campaigns, draft.id]);
  useEffect(() => {
    let active = true;
    if (!organisationId || !draft.subscriptionTypeId) {
      setExactAudience(null);
      setAudienceDetail(null);
      return () => {
        active = false;
      };
    }
    void previewEmailAudienceDetail({
      organisationId,
      subscriptionTypeId: draft.subscriptionTypeId,
      audienceFilter: draft.audienceFilter,
    })
      .then((detail) => {
        if (active) {
          setAudienceDetail(detail);
          setExactAudience(Number(detail?.eligible || 0));
        }
      })
      .catch(() => previewEmailAudience({ organisationId, subscriptionTypeId: draft.subscriptionTypeId, audienceFilter: draft.audienceFilter }))
      .then((count) => {
        if (active && typeof count === "number") {
          setAudienceDetail(null);
          setExactAudience(count);
        }
      })
      .catch(() => {
        if (active) {
          setAudienceDetail(null);
          setExactAudience(null);
        }
      });
    return () => {
      active = false;
    };
  }, [organisationId, draft.subscriptionTypeId, audienceKey]);
  const save = async (send = false) => {
    setBusy(true);
    setError("");
    try {
      if (send && draft.experimentJson?.enabled && !String(draft.experimentJson.variant_subject || "").trim())
        throw new Error("Add a Variant B subject before scheduling an A/B test.");
      const c = await saveEmailCampaign({
        campaign: draft,
        organisationId,
        userId,
      });
      setDraft((x) => ({ ...x, id: c.id }));
      if (send) {
        const preflight = await preflightEmailCampaign(c.id);
        if (!preflight.ready)
          throw new Error(
            "Preflight found a sending blocker. Check sender, consent category, policy and eligible audience.",
          );
        await scheduleEmailCampaign(
          c.id,
          scheduledFor
            ? new Date(scheduledFor).toISOString()
            : new Date().toISOString(),
        );
      }
      setNotice(
        send
          ? scheduledFor
            ? "Campaign scheduled. Delivery will begin at the selected time."
            : "Campaign queued. Delivery begins in the background."
          : "Draft saved.",
      );
      await refresh();
    } catch (e) {
      setError(e.message || "Unable to save campaign.");
    } finally {
      setBusy(false);
    }
  };
  const sendTest = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await sendEmailCampaignTest({
        organisationId,
        senderIdentityId: draft.senderIdentityId,
        subject: draft.subject,
        html: draft.html,
      });
      setNotice(
        `Test sent to ${result.deliveredTo}. It is excluded from campaign analytics.`,
      );
    } catch (e) {
      setError(e.message || "Unable to send test email.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wa-page wa-create-page email-page">
      <button className="wa-back-link" type="button" onClick={onBack}>
        <ArrowLeft size={15} /> Email Campaigns
      </button>
      <ol className="wa-step-header">
        {STEPS.map((x, i) => (
          <li
            className={
              step === i ? "wa-step-active" : step > i ? "wa-step-complete" : ""
            }
            key={x}
          >
            <span className="wa-step-number">
              {step > i ? <Check size={14} /> : i + 1}
            </span>
            <span className="wa-step-copy">
              <strong>{x}</strong>
              <small>
                {
                  [
                    "Set essentials",
                    "Choose recipients",
                    "Build email",
                    "Confirm delivery",
                  ][i]
                }
              </small>
            </span>
          </li>
        ))}
      </ol>
      <section className="wa-form-card">
        <div className="wa-card-heading">
          <span>Step {step + 1} of 4</span>
          <h2>{STEPS[step]}</h2>
          <p>
            {step === 1
              ? "Invalid, duplicated and suppressed emails are automatically excluded."
              : step === 2
                ? "Use merge fields and leave unsubscribe handling to Arch9."
                : "A focused campaign, with all delivery controls built in."}
          </p>
        </div>
        {step === 0 && (
          <div className="wa-form-fields">
            <label className="wa-field-label">
              <span>Campaign name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="September buyer update"
              />
            </label>
            <label className="wa-field-label">
              <span>Subject line</span>
              <input
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
                placeholder="New homes worth seeing this week"
              />
            </label>
            <label className="wa-field-label">
              <span>Preview text</span>
              <input
                value={draft.previewText}
                onChange={(e) =>
                  setDraft({ ...draft, previewText: e.target.value })
                }
              />
            </label>
            <label className="wa-field-label">
              <span>Email category</span>
              <select
                value={draft.subscriptionTypeId}
                onChange={(e) =>
                  setDraft({ ...draft, subscriptionTypeId: e.target.value })
                }
              >
                <option value="">Select a consent category</option>
                {subscriptionTypes.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <small>
                Only recipients opted into this category can be scheduled.
              </small>
            </label>
            <label className="wa-field-label">
              <span>Verified sender</span>
              <select
                value={draft.senderIdentityId}
                onChange={(e) => {
                  const i = identities.find((x) => x.id === e.target.value);
                  setDraft({
                    ...draft,
                    senderIdentityId: e.target.value,
                    replyToEmail: i?.reply_to_email || "",
                  });
                }}
              >
                <option value="">Select a sender identity</option>
                {identities.map((x) => (
                  <option
                    value={x.id}
                    disabled={x.verification_status !== "verified"}
                    key={x.id}
                  >
                    {x.display_name} · {x.from_email} ({x.verification_status})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="wa-form-fields">
            <AudienceStudio
              audienceFilter={draft.audienceFilter}
              onChange={(audienceFilter) =>
                setDraft((current) => ({ ...current, audienceFilter }))
              }
              contacts={contacts}
              savedAudiences={savedAudiences}
              contactTags={contactTags}
              organisationId={organisationId}
              userId={userId}
              onRefresh={refresh}
              setNotice={setNotice}
              setError={setError}
            />
            <div className="email-audience-count">
              <UsersRound size={20} />
              <div>
                <strong>
                  {exactAudience === null
                    ? `${fmt(audience.length)} CRM contacts shown`
                    : `${fmt(exactAudience)} eligible recipients`}
                </strong>
                <small>
                  {exactAudience === null
                    ? "Choose an email category to calculate consent-aware eligibility."
                    : "Exact count includes consent, subscription, suppression and deduplication rules."}
                </small>
              </div>
            </div>
            {audienceDetail && <div className="email-audience-evidence" aria-live="polite"><span>{fmt(audienceDetail.matching_contacts)} matched</span><span>{fmt(audienceDetail.eligible)} eligible</span><span>{fmt(audienceDetail.no_marketing_consent)} no consent</span><span>{fmt(audienceDetail.unsubscribed_category)} category unsubscribed</span><span>{fmt(audienceDetail.suppressed)} suppressed</span></div>}
          </div>
        )}
        {step === 2 && (
          <>
            <TemplateStudio
              html={draft.html}
              onChange={(html) => setDraft((current) => ({ ...current, html }))}
              templates={templates}
              imageAssets={imageAssets}
              organisationId={organisationId}
              userId={userId}
              onRefresh={refresh}
              busy={busy}
              setNotice={setNotice}
              setError={setError}
            />
            <div className="email-editor-grid">
              <label className="wa-field-label">
                <span>
                  Email HTML <small>Advanced</small>
                </span>
                <textarea
                  rows="13"
                  value={draft.html}
                  onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                />
                <small>
                  Merge: {"{{first_name}}"}, {"{{last_name}}"},{" "}
                  {"{{full_name}}"}, {"{{agent_name}}"}, {"{{agency_name}}"},{" "}
                  {"{{branch_name}}"}
                </small>
                <button
                  type="button"
                  className="wa-secondary-button"
                  disabled={!sender || busy}
                  onClick={() => void sendTest()}
                >
                  Send test to me
                </button>
              </label>
              <div className="email-preview">
                <small>LIVE PREVIEW</small>
                <h2>{draft.subject || "Your subject line"}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: safePreviewHtml(draft.html).replace(
                      /\{\{first_name\}\}/g,
                      "Alex",
                    ),
                  }}
                />
                <footer>
                  Unsubscribe link and required agency details are added
                  automatically.
                </footer>
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="email-review">
              <div>
                <span>From</span>
                <strong>
                  {sender
                    ? `${sender.display_name} <${sender.from_email}>`
                    : "Choose a verified sender"}
                </strong>
              </div>
              <div>
                <span>Consent category</span>
                <strong>
                  {subscriptionTypes.find(
                    (x) => x.id === draft.subscriptionTypeId,
                  )?.name || "Choose a category"}
                </strong>
              </div>
              <div>
                <span>Audience snapshot</span>
                <strong>
                  {exactAudience === null
                    ? "Calculate eligibility first"
                    : `${fmt(exactAudience)} eligible recipients`}
                </strong>
              </div>
              <div>
                <span>Estimated usage</span>
                <strong>
                  {exactAudience === null
                    ? "Awaiting eligible count"
                    : `${fmt(exactAudience)} emails · R0 today`}
                </strong>
              </div>
              <p>Opens are indicative only; privacy tools can distort them.</p>
            </div>
            <label className="wa-field-label email-schedule-field">
              <span>
                <CalendarClock size={15} /> Send time <small>Optional</small>
              </span>
              <input
                type="datetime-local"
                value={scheduledFor}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
              <small>
                Leave blank to queue immediately. Arch9 runs a server-side
                preflight before either action.
              </small>
            </label>
            <label className="email-experiment"><input type="checkbox" checked={Boolean(draft.experimentJson?.enabled)} onChange={(event) => setDraft((current) => ({ ...current, experimentJson: event.target.checked ? { enabled: true, variant_subject: experimentSubject, sample_percent: 20, metric: "open_rate", decision_window_minutes: 240 } : {} }))} /> <span><strong>Test an alternate subject line</strong><small>Send a 20% sample, then Arch9 automatically selects the better subject after four hours before releasing the remaining audience.</small></span></label>
            <label className="email-experiment"><input type="checkbox" checked={Boolean(draft.approvalRequired)} onChange={(event) => setDraft((current) => ({ ...current, approvalRequired: event.target.checked }))} /> <span><strong>Require approval before sending</strong><small>Save the campaign, then request review from Plan &amp; approvals. Any material edit will require another approval.</small></span></label>
            {draft.experimentJson?.enabled && <label className="wa-field-label"><span>Variant B subject</span><input value={experimentSubject} onChange={(event) => { setExperimentSubject(event.target.value); setDraft((current) => ({ ...current, experimentJson: { ...current.experimentJson, variant_subject: event.target.value } })) }} placeholder="A different subject line" /></label>}
            {sendPreviewOpen && <section className="email-send-preview" aria-label="Send preview"><header><div><span className="email-eyebrow">NON-SENDING PREVIEW</span><h3>Exactly what will be prepared</h3></div><button type="button" className="wa-secondary-button" onClick={() => setSendPreviewOpen(false)}>Close</button></header><div className="email-send-preview-meta"><span><strong>From</strong>{sender ? `${sender.display_name} <${sender.from_email}>` : "Sender required"}</span><span><strong>To</strong>{exactAudience === null ? "Audience still calculating" : `${fmt(exactAudience)} eligible recipients`}</span><span><strong>Subject</strong>{draft.subject || "Subject required"}</span><span><strong>When</strong>{scheduledFor ? stamp(new Date(scheduledFor).toISOString()) : "Immediately after preflight"}</span></div><div className="email-send-preview-body"><small>RECIPIENT VIEW</small><h2>{draft.subject || "Your subject line"}</h2><p>{draft.previewText}</p><div dangerouslySetInnerHTML={{ __html: safePreviewHtml(draft.html).replace(/\{\{first_name\}\}/g, "Alex") }} /><footer>Arch9 adds the agency footer, unsubscribe link and click tracking only at delivery time.</footer></div><p className="email-send-preview-note">This does not send anything. The live action reruns consent, suppression, sender and policy preflight checks.</p></section>}
          </>
        )}
        {error && <p className="wa-error">{error}</p>}
        {notice && <p className="wa-notice">{notice}</p>}
        <div className="wa-form-footer">
          {step > 0 && (
            <button
              type="button"
              className="wa-secondary-button"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="wa-primary-button"
              onClick={() => setStep(step + 1)}
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="wa-secondary-button"
                disabled={busy}
                onClick={() => void save()}
              >
                Save draft
              </button>
              <button type="button" className="wa-secondary-button" disabled={busy} onClick={() => setSendPreviewOpen(true)}><Eye size={15} /> Send preview</button>
              <button
                type="button"
                className="wa-primary-button"
                disabled={
                  busy || !sender || !draft.subscriptionTypeId || !exactAudience
                }
                onClick={() => void save(true)}
              >
                <Send size={15} />{" "}
                {busy
                  ? "Preparing…"
                  : scheduledFor
                    ? "Preflight & schedule"
                    : "Preflight & send"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function EmailCampaignDetail({ campaignId, onBack }) {
  const { campaigns, performance, refresh } = useCampaigns();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const [report, setReport] = useState({
    loading: true,
    recipients: [],
    events: [],
    links: [],
    audit: [],
    experiment: null,
  });
  const [query, setQuery] = useState("");
  const c = campaigns.find((x) => x.id === campaignId);
  const m = performance.find((x) => x.campaign_id === campaignId) || {};
  const loadReport = async () => {
    const data = await getEmailCampaignAnalytics(campaignId);
    setReport({ loading: false, ...data });
  };
  useEffect(() => {
    let active = true;
    void getEmailCampaignAnalytics(campaignId)
      .then((data) => {
        if (active) setReport({ loading: false, ...data });
      })
      .catch((cause) => {
        if (active) {
          setError(cause.message || "Unable to load campaign activity.");
          setReport((current) => ({ ...current, loading: false }));
        }
      });
    return () => {
      active = false;
    };
  }, [campaignId]);
  const run = async (action) => {
    setOperationBusy(true);
    setError("");
    try {
      const message = await action();
      setNotice(message);
      await refresh();
      await loadReport();
    } catch (e) {
      setError(e.message || "Campaign operation failed.");
    } finally {
      setOperationBusy(false);
    }
  };
  const cancel = () =>
    run(async () => {
      await cancelEmailCampaign(campaignId);
      return "Scheduled campaign cancelled.";
    });
  const duplicate = () =>
    run(async () => {
      await duplicateEmailCampaign(campaignId);
      return "A draft copy was created.";
    });
  const archive = () =>
    run(async () => {
      await archiveEmailCampaign(campaignId);
      return "Campaign archived.";
    });
  const preflight = () =>
    run(async () => {
      const result = await preflightEmailCampaign(campaignId);
      return result.ready
        ? `Preflight passed for ${fmt(result.eligible_recipients)} eligible recipients.`
        : "Preflight found a blocking issue. Review sender, consent category, policy and audience.";
    });
  const rows = report.recipients.filter((recipient) =>
    `${recipient.email} ${recipient.recipient_snapshot?.full_name || ""} ${recipient.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (!c)
    return (
      <div className="wa-page email-page">
        <button className="wa-back-link" type="button" onClick={onBack}>
          <ArrowLeft size={15} /> Email Campaigns
        </button>
        <p className="wa-empty">Loading campaign…</p>
      </div>
    );
  return (
    <div className="wa-page email-page">
      <button className="wa-back-link" type="button" onClick={onBack}>
        <ArrowLeft size={15} /> Email Campaigns
      </button>
      <section className="wa-form-card">
        <div className="wa-card-heading">
          <span>CAMPAIGN PERFORMANCE</span>
          <h2>{c.name}</h2>
          <p>{c.subject}</p>
          <Status value={c.status} />
        </div>
        <Stats campaigns={[c]} performance={[m]} />
        <div className="email-operations">
          <button
            type="button"
            className="wa-secondary-button"
            disabled={operationBusy}
            onClick={() => void preflight()}
          >
            <ShieldCheck size={15} /> Run preflight
          </button>
          <button
            type="button"
            className="wa-secondary-button"
            disabled={operationBusy}
            onClick={() => void duplicate()}
          >
            <Copy size={15} /> Duplicate
          </button>
          {[
            "draft",
            "sent",
            "partially_failed",
            "failed",
            "cancelled",
          ].includes(c.status) && (
            <button
              type="button"
              className="wa-secondary-button"
              disabled={operationBusy}
              onClick={() => void archive()}
            >
              <Archive size={15} /> Archive
            </button>
          )}
        </div>
        <div className="email-review">
          <div>
            <span>Recipients</span>
            <strong>{fmt(m.recipients)}</strong>
          </div>
          <div>
            <span>Bounced</span>
            <strong>{fmt(m.bounced)}</strong>
          </div>
          <div>
            <span>Unsubscribed</span>
            <strong>{fmt(m.unsubscribed)}</strong>
          </div>
          <div>
            <span>Failed</span>
            <strong>{fmt(m.failed)}</strong>
          </div>
        </div>
        {report.links.length > 0 && (
          <section className="email-report-section">
            <div className="email-report-heading">
              <div>
                <span className="email-eyebrow">LINK PERFORMANCE</span>
                <h3>What recipients clicked</h3>
              </div>
              <small>Unique clickers are deduplicated by recipient.</small>
            </div>
            <div className="email-link-list">
              {report.links.map((link) => (
                <article key={link.target_url}>
                  <a href={link.target_url} target="_blank" rel="noreferrer">
                    {link.target_url}
                  </a>
                  <strong>
                    {fmt(link.unique_clickers)} unique · {fmt(link.clicks)}{" "}
                    clicks
                  </strong>
                </article>
              ))}
            </div>
          </section>
        )}
        {report.experiment && (
          <section className="email-report-section">
            <div className="email-report-heading"><div><span className="email-eyebrow">A/B EXPERIMENT</span><h3>Subject-line decision</h3></div><Status value={report.experiment.status} /></div>
            <div className="email-review"><div><span>Metric</span><strong>{report.experiment.metric?.replace("_", " ")}</strong></div><div><span>Sample</span><strong>{fmt(report.experiment.sample_recipient_count)} recipients</strong></div><div><span>Winner</span><strong>{report.experiment.winner_variant || "Awaiting result"}</strong></div><div><span>Control events</span><strong>{fmt(report.experiment.result_json?.control_events)}</strong></div><div><span>Variant events</span><strong>{fmt(report.experiment.result_json?.variant_events)}</strong></div></div>
          </section>
        )}
        <section className="email-report-section">
          <div className="email-report-heading">
            <div>
              <span className="email-eyebrow">RECIPIENT ACTIVITY</span>
              <h3>Delivery-level evidence</h3>
            </div>
            <label className="email-activity-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email or status"
              />
            </label>
          </div>
          {report.loading ? (
            <p className="wa-empty">Loading recipient activity…</p>
          ) : (
            <div className="email-activity-table">
              <div className="email-activity-row email-activity-head">
                <span>Recipient</span>
                <span>Status</span>
                <span>Latest activity</span>
                <span>Detail</span>
              </div>
              {rows.map((recipient) => {
                const event = report.events.find(
                  (item) => item.recipient_id === recipient.id,
                );
                return (
                  <div className="email-activity-row" key={recipient.id}>
                    <span>
                      <strong>
                        {recipient.recipient_snapshot?.full_name ||
                          recipient.email}
                      </strong>
                      <small>{recipient.email}</small>
                    </span>
                    <Status value={recipient.status} />
                    <span>
                      {event
                        ? `${event.event_type} · ${new Date(event.occurred_at).toLocaleString()}`
                        : "No provider event yet"}
                    </span>
                    <span>
                      {recipient.error_reason ||
                        (event?.url ? "Tracked link activity" : "—")}
                    </span>
                  </div>
                );
              })}
              {!rows.length && (
                <p className="wa-empty">No recipients match that search.</p>
              )}
            </div>
          )}
        </section>
        {report.audit.length > 0 && (
          <section className="email-report-section">
            <div className="email-report-heading">
              <div>
                <span className="email-eyebrow">CAMPAIGN LOG</span>
                <h3>Operational audit trail</h3>
              </div>
            </div>
            <div className="email-audit-list">
              {report.audit.map((event) => (
                <p key={event.id}>
                  <strong>{event.event_type.replace("_", " ")}</strong>
                  <span>{new Date(event.created_at).toLocaleString()}</span>
                </p>
              ))}
            </div>
          </section>
        )}
        {error && <p className="wa-error">{error}</p>}
        {notice && <p className="wa-notice">{notice}</p>}
        {c.status === "scheduled" && (
          <div className="wa-form-footer">
            <button
              type="button"
              className="wa-secondary-button"
              disabled={operationBusy}
              onClick={() => void cancel()}
            >
              Cancel scheduled campaign
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
