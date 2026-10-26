import { validCalendarDate } from '../../services/marketingCalendarModel';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  Mail,
  MoreVertical,
  Pencil,
  Redo2,
  Save,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { useAuthSession } from "../../context/AuthSessionContext";
import {
  createEmailSender,
  checkEmailCampaignContent,
  createEmailSendingDomain,
  getEmailDraft,
  getEmailRevisions,
  preflightEmailCampaign,
  previewEmailAudience,
  refreshEmailSenderVerification,
  saveEmailCampaign,
  saveEmailTemplate,
  scheduleEmailCampaign,
  sendEmailCampaignTest,
  verifyEmailSendingDomain,
} from "../../services/emailCampaignService";
import { getOrganisationPrivateListings } from "../../services/privateListingService";
import {
  createEmailDocument,
  mergeEmail,
  normalizeDocument,
  renderEmail,
} from "../../../../supabase/functions/_shared/emailDocument.js";
import EmailVisualEditor from "./EmailVisualEditor";
import EmailCampaignImages from "./EmailCampaignImages";
import EmailCampaignImport from "./EmailCampaignImport";
import { inspectCampaignEmail } from "../../../../supabase/functions/_shared/emailContent.js";
import "./EmailCampaignBuilder.css";
import AiCampaignAssistant from './AiCampaignAssistant';
import { reviewAiCampaign, approveAiCampaign } from '../../services/aiCampaignService';
import { ensureEmailCampaignPlan } from '../../services/emailCampaignPlanService';

const MarketingAudiencePicker = lazy(() => import("./MarketingAudiences").then((module) => ({ default: module.MarketingAudiencePicker })));
const STEPS = ["Details", "Audience", "Content", "Review"];
const fromRow = (row, brand) => ({
  id: row.id,
  clientId: row.id,
  updatedAt: row.updated_at,
  developmentContext: row.content_json?.arch9_context || null,
  name: row.name,
  subject: row.subject,
  previewText: row.preview_text || "",
  senderIdentityId: row.sender_identity_id || "",
  subscriptionTypeId: row.subscription_type_id || "",
  audienceFilter: row.audience_filter || {},
  replyToEmail: row.reply_to_email || "",
  contentJson:
    row.content_json?.version === 1
      ? normalizeDocument(row.content_json)
      : {
          ...createEmailDocument(brand),
          mode: "advanced",
          advancedHtml: row.html || "",
        },
});
const blank = (brand) => ({
  clientId: crypto.randomUUID(),
  name: "Untitled campaign",
  subject: "",
  previewText: "",
  senderIdentityId: "",
  subscriptionTypeId: "",
  audienceFilter: {},
  replyToEmail: "",
  contentJson: createEmailDocument(brand),
});
const keepCampaignReference = (next, current) => {
  const document = normalizeDocument(next);
  delete document.arch9_campaign;
  if (current.arch9_campaign) document.arch9_campaign = { ...current.arch9_campaign };
  return document;
};
export default function EmailCampaignBuilder({
  initialListingId,
  initialObjective,
  initialEventId,
  openAiAssistant = false,
  initialScheduleDate,
  workspace,
  AudienceStudio,
  onBack,
  campaignId,
  onDraftCreated,
  developmentContext,
  onOpenMarketingCampaign,
}) {
  const {
    organisationId,
    userId,
    identities,
    domains = [],
    contacts,
    subscriptionTypes,
    templates,
    savedAudiences,
    refresh,
  } = workspace;
  const { authState } = useAuthSession();
  const currentWorkspace = authState?.currentWorkspace;
  const brand = useMemo(
    () => ({
      name: currentWorkspace?.name || currentWorkspace?.displayName || "",
      logoUrl: currentWorkspace?.logoUrl || currentWorkspace?.logo_url || "",
    }),
    [currentWorkspace],
  );
  const [draft, setDraft] = useState(() => ({ ...blank(brand), ...(developmentContext ? { name: `${developmentContext.development_name} campaign`, developmentContext } : {}) }));
  const [ready, setReady] = useState(!campaignId);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState("Changes not saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiReview, setAiReview] = useState(null);
  const [audienceCount, setAudienceCount] = useState(null);
  const [listings, setListings] = useState([]);
  const [modal, setModal] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [checkedContent, setCheckedContent] = useState(null);
  const [testEmail, setTestEmail] = useState(authState?.user?.email || "");
  const [testRecipient, setTestRecipient] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [senderName, setSenderName] = useState(brand.name);
  const [senderEmail, setSenderEmail] = useState("");
  const [sendingDomainId, setSendingDomainId] = useState("");
  const [scheduledFor, setScheduledFor] = useState(() => {
    if (campaignId || !validCalendarDate(initialScheduleDate)) return "";
    // The existing datetime input uses the browser's local time. Convert 09:00 SAST
    // to that timezone so scheduling preserves the selected South African day.
    const instant = new Date(`${initialScheduleDate}T09:00:00+02:00`);
    const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [revisions, setRevisions] = useState([]);
  const [history, setHistory] = useState({ past: [], future: [] });
  const dialogRef = useRef(null);
  const draftRef = useRef(draft);
  const persisted = useRef("");
  const saving = useRef(null);
  const linkPending = useRef(false);
  const pendingLinkSave = useRef(null);
  const lastId = useRef(campaignId || "");
  const lifetime = useRef(0);
  const invalidateLifetime = useCallback(() => { lifetime.current++ }, []);
  useEffect(() => {
    invalidateLifetime();
    saving.current = null;
    linkPending.current = false;
    pendingLinkSave.current = null;
    return invalidateLifetime;
  }, [organisationId, userId, campaignId, invalidateLifetime]);
  const loadedId = useRef("");
  const nameInput = useRef(null);
  const sender = identities.find(
    (s) =>
      s.id === draft.senderIdentityId &&
      s.verification_status === "verified" &&
      !s.sending_paused_at,
  );
  const sendingDomain = domains.find((domain) => domain.id === sendingDomainId);
  const copyDnsRecord = async (record) => {
    const content = [
      `Type: ${record.type}`,
      `Host: ${record.name}`,
      `Value: ${record.value}`,
      record.priority ? `Priority: ${record.priority}` : "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(content);
      setNotice(`DNS record for ${record.name} copied.`);
    } catch {
      setError("Unable to copy this DNS record. Select and copy the values manually.");
    }
  };
  const context = {
    agencyName: brand.name || sender?.display_name,
    senderEmail: sender?.from_email,
    previewText: draft.previewText,
  };
  const html =
    draft.contentJson.mode === "advanced"
      ? draft.contentJson.advancedHtml || ""
      : renderEmail(draft.contentJson, context);
  const missing = {
    name: !draft.name.trim() ? "Give your campaign an internal name." : "",
    subject: !draft.subject.trim()
      ? "Add a subject line before continuing."
      : "",
    subscriptionTypeId: !subscriptionTypes.some(
      (s) => s.id === draft.subscriptionTypeId,
    )
      ? "Choose a send permission category."
      : "",
    senderIdentityId: !sender ? "Select a verified, active sender." : "",
  };
  const detailsReady = !Object.values(missing).some(Boolean);
  const draftDetailsReady = !missing.name && !missing.subject && !missing.subscriptionTypeId;
  const localContentCheck = useMemo(() => inspectCampaignEmail({ contentJson: draft.contentJson }, {
    agencyName: brand.name || sender?.display_name,
    senderEmail: sender?.from_email,
    previewText: draft.previewText,
  }), [draft.contentJson, draft.previewText, brand.name, sender?.display_name, sender?.from_email]);
  const contentIssues = localContentCheck.errors;
  const contentKey = JSON.stringify([organisationId, draft.contentJson, draft.previewText, draft.senderIdentityId]);
  const serverContentCheck = checkedContent?.key === contentKey ? checkedContent.report : null;
  const compatibilityWarnings = [...new Set([...localContentCheck.warnings, ...(serverContentCheck?.warnings || [])])];
  const completedSteps = [detailsReady, Number(audienceCount) > 0, !contentIssues.length, false];
  const update = (patch) => {
    setAiReview(null);
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState("Changes not saved");
  };
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    if (!modal) return;
    const previous = window.document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [
      ...dialog.querySelectorAll(
        'button:not(:disabled), input, select, textarea, [tabindex="0"]',
      ),
    ];
    focusable()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") setModal("");
      if (event.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [modal]);

  useEffect(() => {
    if (
      !organisationId ||
      !campaignId ||
      loadedId.current === campaignId ||
      (lastId.current === campaignId && persisted.current)
    )
      return;
    let active = true;
    setReady(false);
    getEmailDraft(organisationId, campaignId)
      .then((row) => {
        if (active) {
          const value = fromRow(row, brand);
          loadedId.current = row.id;
          lastId.current = row.id;
          persisted.current = JSON.stringify(value);
          setDraft(value);
          setSaveState("Saved");
          setBusy(false);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(`Unable to restore this draft: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [organisationId, campaignId, brand]);
  useEffect(() => {
    if (!organisationId) return;
    let active = true;
    getOrganisationPrivateListings(organisationId, {
      includeRequirementsAndDocuments: false,
    })
      .then((rows) => {
        if (active)
          setListings(
            rows.map((l) => ({
              id: l.id,
              address:
                l.addressLine1 || l.formattedAddress || l.title || "Property",
              suburb: l.suburb || "",
              image:
                l.marketing?.mediaUrl || l.marketing?.imageGallery?.[0]?.url || l.images?.[0]?.url || "",
              price: l.askingPrice
                ? new Intl.NumberFormat("en-ZA", {
                    style: "currency",
                    currency: "ZAR",
                    maximumFractionDigits: 0,
                  }).format(l.askingPrice)
                : "Price on request",
              features: [
                l.bedrooms != null && `${l.bedrooms} beds`,
                l.bathrooms != null && `${l.bathrooms} baths`,
                l.parkingBays != null && `${l.parkingBays} parking`,
              ]
                .filter(Boolean)
                .join(" · "),
              url:
                l.bridgeListingPublicUrl ||
                l.property24ListingUrl ||
                l.privatePropertyListingUrl ||
                "",
            })),
          );
      })
      .catch((e) => {
        if (active) setNotice(`Listing library unavailable: ${e.message}`);
      });
    return () => {
      active = false;
    };
  }, [organisationId]);
  const audienceKey = JSON.stringify(draft.audienceFilter);
  useEffect(() => {
    let active = true;
    setAudienceCount(null);
    if (draft.subscriptionTypeId && organisationId)
      previewEmailAudience({
        organisationId,
        subscriptionTypeId: draft.subscriptionTypeId,
        audienceFilter: JSON.parse(audienceKey),
      })
        .then((count) => {
          if (active) setAudienceCount(count);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [organisationId, draft.subscriptionTypeId, audienceKey]);
  const persist = useCallback(async () => {
    if (saving.current) {
      await saving.current;
      return persist();
    }
    const current = draftRef.current;
    const scope = lifetime.current;
    const assertScope = () => { if (scope !== lifetime.current) throw Object.assign(new Error('The draft was saved in your previous workspace or campaign. Reopen it there before continuing.'), { code: 'EMAIL_DRAFT_SCOPE_CHANGED' }) };
    if (!organisationId || !current.name.trim())
      throw new Error("Add an internal campaign name to save this draft.");
    if (persisted.current === JSON.stringify(current) && lastId.current && !linkPending.current && !(current.contentJson.ai_campaign && !current.contentJson.arch9_campaign))
      return lastId.current;
    setSaveState("Saving…");
    const output =
      current.contentJson.mode === "advanced"
        ? current.contentJson.advancedHtml
        : renderEmail(current.contentJson, {
            agencyName: brand.name,
            previewText: current.previewText,
          });
    const operation = (async () => {
      let base = current;
      if (pendingLinkSave.current) {
        const recovered = await ensureEmailCampaignPlan(organisationId, userId, pendingLinkSave.current);
        assertScope();
        const reference = recovered.content_json?.arch9_campaign;
        const mergeRecovered = (value) => ({ ...value, id: recovered.id, updatedAt: recovered.updated_at, contentJson: { ...value.contentJson, ...(reference ? { arch9_campaign: reference } : {}) } });
        base = mergeRecovered(current);
        draftRef.current = mergeRecovered(draftRef.current);
        setDraft(mergeRecovered);
        pendingLinkSave.current = null;
        linkPending.current = false;
      }
      let saved = await saveEmailCampaign({
        organisationId,
        userId,
        campaign: { ...base, id: lastId.current || undefined, html: output },
      });
      assertScope();
      if (base.contentJson.ai_campaign && !base.contentJson.arch9_campaign) {
        try {
          saved = await ensureEmailCampaignPlan(organisationId, userId, saved);
          linkPending.current = false;
        } catch (linkError) {
          assertScope();
          linkPending.current = true;
          if (linkError.code !== 'EMAIL_CAMPAIGN_LINK_SETUP') pendingLinkSave.current = saved;
          setNotice(linkError.message);
        }
      }
      return saved;
    })();
    saving.current = operation;
    try {
      const saved = await operation;
      assertScope();
      lastId.current = saved.id;
      const savedTimestamp = saved.updated_at || current.updatedAt;
      const reference = saved.content_json?.arch9_campaign;
      const savedMetadata = { id: saved.id, ...(savedTimestamp ? { updatedAt: savedTimestamp } : {}) };
      const snapshot = { ...current, ...savedMetadata, ...(reference ? { contentJson: { ...current.contentJson, arch9_campaign: reference } } : {}) };
      persisted.current = JSON.stringify(snapshot);
      const mergeSaved = (latest) => ({ ...latest, ...savedMetadata, ...(reference ? { contentJson: { ...latest.contentJson, arch9_campaign: reference } } : {}) });
      setDraft(mergeSaved);
      draftRef.current = mergeSaved(draftRef.current);
      setSaveState(
        JSON.stringify(draftRef.current) === persisted.current
          ? "Saved just now"
          : "Changes not saved",
      );
      onDraftCreated?.(saved.id);
      return saved.id;
    } catch (e) {
      if (scope === lifetime.current) setSaveState("Changes not saved");
      throw e;
    } finally {
      if (saving.current === operation) saving.current = null;
    }
  }, [organisationId, userId, brand.name, onDraftCreated]);
  useEffect(() => {
    if (
      !ready ||
      !organisationId ||
      !draft.name.trim() ||
      persisted.current === JSON.stringify(draft)
    )
      return;
    const timer = setTimeout(() => {
      void persist().catch((e) => { if (e.code !== 'EMAIL_DRAFT_SCOPE_CHANGED') setError(`Draft could not be saved: ${e.message}`) });
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, organisationId, ready, persist]);
  useEffect(() => {
    const beforeUnload = (e) => {
      if (saveState !== "Changes not saved" && saveState !== "Saving…") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [saveState]);
  const run = async (action) => {
    const scope = lifetime.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (scope === lifetime.current) setError(e.message || "Please try again.");
    } finally {
      if (scope === lifetime.current) setBusy(false);
    }
  };
  const go = async (next) => {
    if (next <= step) { setStep(next); setError(""); return; }
    if ((next === 3 && !detailsReady) || (next === 1 && !draftDetailsReady)) {
      setError("Complete the required campaign details before continuing.");
      setStep(0);
      return;
    }
    if (
      next === 3 &&
      (audienceCount === null || !audienceCount || contentIssues.length)
    ) {
      setError(
        contentIssues[0] ||
          "Choose an audience with at least one eligible recipient before Review.",
      );
      return;
    }
    await run(async () => {
      await persist();
      setStep(next);
    });
  };
  const changeDocument = (next) => {
    setHistory((h) => ({
      past: [...h.past.slice(-49), draft.contentJson],
      future: [],
    }));
    update({ contentJson: keepCampaignReference(next, draft.contentJson) });
  };
  const undo = () => {
    if (!history.past.length) return;
    update({ contentJson: keepCampaignReference(history.past.at(-1), draft.contentJson) });
    setHistory({
      past: history.past.slice(0, -1),
      future: [draft.contentJson, ...history.future],
    });
  };
  const redo = () => {
    if (!history.future.length) return;
    update({ contentJson: keepCampaignReference(history.future[0], draft.contentJson) });
    setHistory({
      past: [...history.past, draft.contentJson],
      future: history.future.slice(1),
    });
  };
  const leave = () =>
    void run(async () => {
      await persist();
      onBack();
    });
  const field = (label, key, placeholder, help, maxLength) => (
    <label className="eb-field">
      <span>
        {label}
        {maxLength && (
          <small>
            {draft[key].length} / {maxLength}
          </small>
        )}
      </span>
      <input
        aria-label={label}
        ref={key === "name" ? nameInput : undefined}
        value={draft[key]}
        maxLength={maxLength || 180}
        placeholder={placeholder}
        aria-invalid={Boolean(missing[key])}
        onChange={(e) => update({ [key]: e.target.value })}
      />
      {help && <small>{help}</small>}
      {missing[key] && <small className="eb-validation">{missing[key]}</small>}
    </label>
  );
  const openPreview = () => {
    setPreviewHtml(
      mergeEmail(html, {
        agency_name: context.agencyName,
        ...contacts.find((c) => c.id === testRecipient),
      }),
    );
    setModal("preview");
  };
  if (workspace.loading && !organisationId)
    return <p>Loading campaign workspace…</p>;
  return (
    <div className="eb-builder">
      <header className="eb-header">
        <div>
          <button className="eb-back" onClick={leave}>
            <ArrowLeft size={15} />
            Email campaigns
          </button>
          <div className="eb-title-row">
            <input
              aria-label="Campaign title"
              maxLength={180}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
            />
            <button
              aria-label="Edit campaign name"
              onClick={() => {
                setStep(0);
                requestAnimationFrame(() => nameInput.current?.focus());
              }}
            >
              <Pencil size={16} />
            </button>
            <span className="eb-save-state" role="status">
              {saveState.startsWith("Saved") && <CheckCircle2 size={15} />}
              {saveState}
            </span>
          </div>
        </div>
        <div className="eb-header-actions">
          {step === 2 && (
            <>
              <button onClick={() => setModal("import")}>Upload email</button>
              <button
                aria-label="Undo"
                onClick={undo}
                disabled={!history.past.length}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="Redo"
                onClick={redo}
                disabled={!history.future.length}
              >
                <Redo2 size={17} />
              </button>
              <button onClick={openPreview}>
                <Eye size={16} />
                Preview
              </button>
              <button
                disabled={!sender || busy}
                onClick={() => {
                  setNotice("");
                  setModal("test");
                }}
              >
                <Send size={16} />
                Send test
              </button>
            </>
          )}
          <button
            disabled={busy || !ready}
            onClick={() =>
              void run(async () => {
                await persist();
                if (!linkPending.current) setNotice("Draft saved.");
              })
            }
          >
            <Save size={16} />
            Save as draft
          </button>
          {step === 2 && (
            <button
              className="eb-primary"
              disabled={busy}
              onClick={() => void go(3)}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          )}
          <details className="eb-overflow">
            <summary aria-label="More campaign actions">
              <MoreVertical size={19} />
            </summary>
            <div>
              <button onClick={() => setModal("template")}>
                Save as template
              </button>
              <button onClick={() => setModal("advanced")}>
                Advanced HTML
              </button>
              <button
                disabled={!draft.id}
                onClick={() =>
                  void run(async () => {
                    const rows = await getEmailRevisions(
                      organisationId,
                      draft.id,
                    );
                    setRevisions(rows);
                    setModal("revisions");
                  })
                }
              >
                Revision history
              </button>
            </div>
          </details>
        </div>
      </header>
      {ready && <AiCampaignAssistant key={`${organisationId}:${userId}`} organisationId={organisationId} draft={draft} listings={listings} persist={persist} onApply={(patch) => { update({ ...patch, ...(patch.contentJson ? { contentJson: keepCampaignReference(patch.contentJson, draft.contentJson) } : {}) }); if (patch.contentJson) setStep(2) }} initialListingId={initialListingId} initialObjective={initialObjective} initialEventId={initialEventId} initiallyOpen={openAiAssistant} agencyName={brand.name} subscriptionTypes={subscriptionTypes} onPermissionChange={(subscriptionTypeId) => update({ subscriptionTypeId })} onContinueManual={() => { setStep(2); setError('') }} />}
      {draft.contentJson.arch9_campaign?.id && onOpenMarketingCampaign && (
        <div className="eb-linked-campaign">
          <p>This email is linked to your marketing campaign. Delivery and engagement results appear there.</p>
          <button disabled={busy || !ready} onClick={() => void run(async () => {
            await persist();
            onOpenMarketingCampaign(draft.contentJson.arch9_campaign.id);
          })}>View campaign results <ArrowRight size={16} /></button>
        </div>
      )}
      <nav aria-label="Campaign steps" className="eb-stepper">
        {STEPS.map((label, index) => (
          <button
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={step === index || (index < step && completedSteps[index]) ? "is-current" : ""}
            disabled={busy || !ready}
            onClick={() => void go(index)}
          >
            <span className="eb-step-number">
              {index < step && completedSteps[index] ? <Check size={17} /> : index + 1}
            </span>
            <span>
              <strong>{label}</strong>
              <small>
                {index < step && completedSteps[index]
                  ? "Complete"
                  : index === step
                    ? "In progress"
                    : [
                        "Set essentials",
                        "Choose recipients",
                        "Build email",
                        "Confirm delivery",
                      ][index]}
              </small>
            </span>
          </button>
        ))}
      </nav>
      <main className="eb-stage">
      {(error || workspace.error) && (
        <p role="alert" className="eb-error">
          {error || workspace.error}
        </p>
      )}
      {notice && (
        <p role="status" className="eb-notice">
          {notice}
        </p>
      )}
      {!ready ? (
        <p>Restoring your saved draft…</p>
      ) : (
        <>
          {step === 0 && (
            <div className="eb-details-layout">
              <section className="eb-basics">
                <h1>Set up your email</h1>
                {field(
                  "Internal campaign name",
                  "name",
                  "September buyer update",
                  "Only visible to your team.",
                )}
                {field(
                  "Subject line",
                  "subject",
                  "Homes worth seeing this week",
                  "Aim for a concise subject, ideally under 80 characters.",
                  80,
                )}
                {field(
                  "Preview text",
                  "previewText",
                  "Your next home could be in this week’s selection…",
                  "Shown beside the subject line in many inboxes.",
                  140,
                )}
                <label className="eb-field">
                  <span className="eb-field-heading">
                    Send permission
                    <span title="Consent is checked for this category before delivery.">ⓘ</span>
                  </span>
                  <select
                    value={draft.subscriptionTypeId}
                    onChange={(e) =>
                      update({ subscriptionTypeId: e.target.value })
                    }
                  >
                    <option value="">Select a consent category</option>
                    {subscriptionTypes.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Only contacts with consent for this category can be
                    included.
                  </small>
                  {missing.subscriptionTypeId && (
                    <small className="eb-validation">
                      {missing.subscriptionTypeId}
                    </small>
                  )}
                </label>
                <label className="eb-field">
                  From
                  <select
                    value={draft.senderIdentityId}
                    onChange={(e) =>
                      update({
                        senderIdentityId: e.target.value,
                        replyToEmail:
                          identities.find((s) => s.id === e.target.value)
                            ?.reply_to_email || "",
                      })
                    }
                  >
                    <option value="">Select a sender</option>
                    {identities.map((s) => (
                      <option
                        value={s.id}
                        key={s.id}
                        disabled={
                          s.verification_status !== "verified" ||
                          Boolean(s.sending_paused_at)
                        }
                      >
                        {s.display_name} &lt;{s.from_email}&gt; ·{" "}
                        {s.sending_paused_at ? "Paused" : s.verification_status}
                      </option>
                    ))}
                  </select>
                  {missing.senderIdentityId && (
                    <small className="eb-validation">
                      {missing.senderIdentityId}
                    </small>
                  )}
                </label>
                {!sender && (
                  <div className="eb-attention">
                    <Mail size={22} />
                    <div>
                      <strong>Verify a sender before sending</strong>
                      <p>
                        A verified sender improves deliverability and is
                        required before this campaign can be scheduled.
                      </p>
                      <button onClick={() => setModal("sender")}>
                        Set up sender
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </section>
              <aside className="eb-context">
                <section>
                  <h2>Campaign checklist</h2>
                  {[
                    ["Campaign name", draft.name.trim()],
                    ["Subject line", draft.subject.trim()],
                    ["Preview text", draft.previewText.trim()],
                    ["Consent category", draft.subscriptionTypeId],
                    ["Verified sender", sender],
                  ].map(([label, complete]) => (
                    <div
                      className={`eb-check ${complete ? "is-complete" : ""}`}
                      key={label}
                    >
                      {complete ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Circle size={18} />
                      )}
                      <span>{label}</span>
                      <small>{complete ? "Ready" : "Pending"}</small>
                    </div>
                  ))}
                </section>
                <section className="eb-inbox">
                  <span className="eb-eyebrow">INBOX PREVIEW</span>
                  <div>
                    <span className="eb-avatar">
                      <Mail size={19} />
                    </span>
                    <div>
                      <strong>
                        {sender?.display_name || brand.name || "Your agency"}
                      </strong>
                      <b>{draft.subject || "Your subject line"}</b>
                      <p>
                        {draft.previewText ||
                          "Preview text gives your audience a reason to open."}
                      </p>
                    </div>
                    <small>Now</small>
                  </div>
                </section>
                <p className="eb-context-note">
                  A clear subject and familiar sender help your email feel
                  personal from the first glance.
                </p>
              </aside>
            </div>
          )}
          {step === 1 && (
            <section className="eb-basics eb-contained">
              <span className="eb-eyebrow">AUDIENCE</span>
              <h1>Choose who hears from you</h1>
              <p>
                Only eligible, consented contacts are included. Duplicates and
                suppressed addresses are excluded.
              </p>
              {draft.contentJson.arch9_campaign?.audience_pending && <div className="wa-info-panel"><h3>Choose an audience for this campaign</h3><p>No recipients are selected yet. Choose contacts or filters below.</p><button type="button" className="wa-secondary-button" onClick={() => update({ audienceFilter: {}, contentJson: { ...draft.contentJson, arch9_campaign: { ...draft.contentJson.arch9_campaign, audience_pending: false } } })}>Use all eligible contacts</button></div>}
              <Suspense fallback={<p role="status">Opening shared audiences…</p>}><MarketingAudiencePicker key={organisationId} organisationId={organisationId} channel="email" subscriptionId={draft.subscriptionTypeId} onApply={(ids, audience) => {
                update({ audienceFilter: { contact_ids: ids }, contentJson: { ...draft.contentJson, ...(draft.contentJson.arch9_campaign ? { arch9_campaign: { ...draft.contentJson.arch9_campaign, audience_pending: false } } : {}) } });
                setNotice(`Applied ${ids.length} reviewed recipients from “${audience.name}”.`);
              }} /></Suspense>
              <AudienceStudio
                audienceFilter={draft.audienceFilter}
                onChange={(audienceFilter) => update({ audienceFilter: draft.contentJson.arch9_campaign?.audience_pending ? { ...audienceFilter, contact_ids: (audienceFilter.contact_ids || []).filter((id) => id !== "00000000-0000-0000-0000-000000000000") } : audienceFilter, contentJson: draft.contentJson.arch9_campaign?.audience_pending ? { ...draft.contentJson, arch9_campaign: { ...draft.contentJson.arch9_campaign, audience_pending: false } } : draft.contentJson })}
                contacts={contacts}
                savedAudiences={savedAudiences}
                organisationId={organisationId}
                userId={userId}
                onRefresh={refresh}
                setNotice={setNotice}
                setError={setError}
              />
              <div className="eb-attention">
                <strong>
                  {audienceCount === null
                    ? "Calculating eligible recipients…"
                    : `${audienceCount} eligible recipients`}
                </strong>
              </div>
            </section>
          )}
          {step === 2 &&
            (draft.contentJson.mode === "advanced" ? (
              <section className="eb-basics">
                <div className="eb-canvas-heading">
                  <h2>Advanced HTML</h2>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Return to the preserved visual layout? Manual HTML changes will remain in revision history.",
                        )
                      )
                        changeDocument({
                          ...draft.contentJson,
                          mode: "visual",
                        });
                    }}
                  >
                    Return to visual editor
                  </button>
                </div>
                <p>Use Upload email to import a designer’s HTML and host its images.</p>
                <label className="eb-field">
                  Email HTML
                  <textarea
                    className="eb-code"
                    value={draft.contentJson.advancedHtml || ""}
                    onChange={(e) =>
                      changeDocument({
                        ...draft.contentJson,
                        advancedHtml: e.target.value,
                      })
                    }
                  />
                </label>
                <button onClick={openPreview}>Preview HTML</button>
                <p>
                  Unsubscribe and sender details will be appended automatically.
                </p>
                {contentIssues.length > 0 && <div className="eb-import-error" role="status"><ul>{contentIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
                {compatibilityWarnings.length > 0 && <div className="eb-content-warnings"><strong>Inbox compatibility</strong><ul>{compatibilityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p>A browser preview cannot confirm how every inbox will display an email. Send a test and check your recipients’ usual email clients.</p></div>}
                <EmailCampaignImages key={organisationId} organisationId={organisationId} />
              </section>
            ) : (
              <EmailVisualEditor
                organisationId={organisationId}
                document={draft.contentJson}
                onChange={changeDocument}
                templates={templates}
                listings={listings}
                contacts={contacts}
                brand={brand}
                context={context}
                onSaveTemplate={() => setModal("template")}
                onPreviewTemplate={(t) => {
                  setPreviewHtml(t.html);
                  setModal("preview");
                }}
                onManageBrand={() => setModal("brand")}
              />
            ))}
          {step === 3 && (
            <section className="eb-basics eb-contained">
              <span className="eb-eyebrow">READY FOR DELIVERY</span>
              <h1>Review your campaign</h1>
              <div className="eb-review-grid">
                {[
                  [
                    "From",
                    `${sender?.display_name || ""} <${sender?.from_email || ""}>`,
                  ],
                  ["Subject", draft.subject],
                  [
                    "Send permission",
                    subscriptionTypes.find(
                      (s) => s.id === draft.subscriptionTypeId,
                    )?.name,
                  ],
                  ["Audience", `${audienceCount ?? "—"} eligible recipients`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <button onClick={openPreview}>
                <Eye size={17} />
                Preview email
              </button>
              <label className="eb-field">
                Send time (optional)
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => { setScheduledFor(e.target.value); setAiReview(null); }}
                />
                <small>
                  Leave blank to queue immediately. Sender, consent, content and
                  audience are checked again before scheduling.
                </small>
              </label>
              {draft.contentJson.ai_campaign && <section aria-label="AI campaign sending approval">
                <p>An agency principal or administrator must review this saved version before approving sending.</p>
                <button disabled={busy} onClick={() => void run(async () => {
                  const id = await persist();
                  const snapshotKey = JSON.stringify(draftRef.current);
                  const sendAt = scheduledFor ? new Date(scheduledFor).toISOString() : new Date(Date.now() + 60000).toISOString();
                  const review = await reviewAiCampaign(id, sendAt);
                  if (snapshotKey !== JSON.stringify(draftRef.current)) throw new Error('Campaign changed during review. Review the saved version again.');
                  setAiReview({ ...review, key: snapshotKey });
                })}>Review recipients, timing and charges</button>
                {aiReview && <div role="status"><p>From: {aiReview.sender} · {aiReview.recipients} eligible recipients</p><p>Sending: {new Date(aiReview.send_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST</p><p>Estimated delivery charge: {aiReview.quote.currency} {Number(aiReview.quote.estimated_charge).toFixed(2)}. AI generation is recorded separately.</p><p>Preview the final email above before approving.</p></div>}
              </section>}
              {contentIssues.map((issue) => (
                <p className="eb-error" key={issue}>
                  {issue}
                </p>
              ))}
              <section className="eb-content-check" aria-label="Email content checks">
                <h2>Email content checks</h2>
                <p>{serverContentCheck ? serverContentCheck.ready ? "Server content and hosted image checks passed." : "Resolve these issues before sending." : "Hosted images will be checked again before scheduling and delivery."}</p>
                <button disabled={busy || contentIssues.length > 0} onClick={() => void run(async () => {
                  const key = contentKey;
                  const id = await persist();
                  const report = await checkEmailCampaignContent(id);
                  setCheckedContent({ key, report });
                })}>Check content and hosted images</button>
                {serverContentCheck?.errors?.length > 0 && <div className="eb-import-error" role="alert"><ul>{serverContentCheck.errors.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
                {compatibilityWarnings.length > 0 && <div className="eb-content-warnings"><strong>Inbox compatibility</strong><ul>{compatibilityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                <p>Preview shows the layout in a browser. Use a test email to check the inboxes your recipients use.</p>
              </section>
            </section>
          )}
        </>
      )}
      </main>
          <footer className="eb-bottom">
            <div>
              {step === 2 ? (
                <>
                  <span>
                    <CheckCircle2 size={16} />
                    Unsubscribe protected
                  </span>
                  <span>
                    <CheckCircle2 size={16} />
                    Agency details included
                  </span>
                  <span>
                    {contentIssues.length
                      ? `${contentIssues.length} content checks need attention`
                      : "Content checks pass · delivery checks at Review"}
                  </span>
                </>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await persist();
                      if (!linkPending.current) setNotice("Draft saved.");
                    })
                  }
                >
                  <Save size={16} />
                  Save draft
                </button>
              )}
            </div>
            <div>
              {step > 0 && (
                <button onClick={() => void go(step - 1)}>Back</button>
              )}
              {step < 3 ? (
                <button
                  className="eb-primary"
                  disabled={busy || (step === 0 ? !draftDetailsReady : step === 2 ? !detailsReady : false)}
                  onClick={() => void go(step + 1)}
                >
                  {step === 0 ? "Continue to audience" : "Continue"}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="eb-primary"
                  disabled={
                    busy ||
                    !detailsReady ||
                    !audienceCount ||
                    Boolean(contentIssues.length) ||
                    (Boolean(draft.contentJson.ai_campaign) && (!aiReview || aiReview.key !== JSON.stringify(draft))) ||
                    serverContentCheck?.ready === false
                  }
                  onClick={() =>
                    void run(async () => {
                      if (
                        scheduledFor &&
                        new Date(scheduledFor).getTime() <= Date.now()
                      )
                        throw new Error("Choose a future send time.");
                      const id = await persist();
                      const preflight = await preflightEmailCampaign(id);
                      if (preflight.contentCheck) setCheckedContent({ key: contentKey, report: preflight.contentCheck });
                      if (!preflight.ready)
                        throw new Error(
                          preflight.contentCheck?.errors?.[0] ||
                          "Pre-send checks found an issue. Check sender, consent, sending policy and audience.",
                        );
                      if (draft.contentJson.ai_campaign) {
                        if (!aiReview || aiReview.key !== JSON.stringify(draftRef.current)) throw new Error('Review this saved campaign version before approving.');
                        await approveAiCampaign(id, aiReview);
                      } else await scheduleEmailCampaign(
                        id,
                        scheduledFor
                          ? new Date(scheduledFor).toISOString()
                          : undefined,
                      );
                      persisted.current = JSON.stringify(draftRef.current);
                      setSaveState("Saved");
                      onBack();
                    })
                  }
                >
                  <Send size={16} />
                  {busy
                    ? "Checking…"
                    : draft.contentJson.ai_campaign ? 'Approve reviewed send'
                    : scheduledFor
                      ? "Preflight & schedule"
                      : "Preflight & send"}
                </button>
              )}
            </div>
          </footer>
      {modal && (
        <div className="eb-modal-backdrop">
          <section
            ref={dialogRef}
            className={`eb-modal ${modal === "preview" ? "eb-preview-modal" : ""} ${modal === "import" ? "eb-import-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <button
              className="eb-modal-close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={20} />
            </button>
            {modal === "preview" && (
              <>
                <h2>Email preview</h2>
                <iframe
                  title="Rendered email preview"
                  sandbox=""
                  srcDoc={previewHtml}
                />
              </>
            )}
            {modal === "import" && <EmailCampaignImport key={organisationId} organisationId={organisationId} onImported={({ html: importedHtml, manifest }) => {
              changeDocument({ ...draft.contentJson, mode: "advanced", advancedHtml: importedHtml, importedEmail: manifest });
              setModal("");
              setNotice("Email imported. Its images are hosted and ready for preview.");
            }} />}
            {modal === "advanced" && (
              <>
                <h2>Switch to Advanced HTML</h2>
                <p>
                  Manual HTML replaces the visual output. Your visual layout is
                  preserved so you can return to it. Changes to HTML do not
                  update visual blocks.
                </p>
                <button
                  className="eb-primary"
                  onClick={() => {
                    changeDocument({
                      ...draft.contentJson,
                      mode: "advanced",
                      advancedHtml: html,
                    });
                    setModal("");
                  }}
                >
                  Switch to Advanced HTML
                </button>
              </>
            )}
            {modal === "test" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (contentIssues.length) return setError(contentIssues[0]);
                  void run(async () => {
                    await persist();
                    const result = await sendEmailCampaignTest({
                      organisationId,
                      senderIdentityId: draft.senderIdentityId,
                      subject: draft.subject,
                      html,
                      contentJson: draft.contentJson,
                      previewText: draft.previewText,
                      recipientEmail: testEmail,
                      previewRecipientId: testRecipient || undefined,
                    });
                    setNotice(
                      `Test accepted for delivery to ${result.deliveredTo}. Excluded from campaign analytics and recipient totals.`,
                    );
                  });
                }}
              >
                <h2>Send a test email</h2>
                <p>Preview the real email output before scheduling.</p>
                <label className="eb-field">
                  Recipient email address
                  <input
                    type="email"
                    required
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </label>
                <label className="eb-field">
                  Personalise as
                  <select
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                  >
                    <option value="">Fallback recipient</option>
                    {contacts.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.full_name || c.email}
                      </option>
                    ))}
                  </select>
                </label>
                {contentIssues.length > 0 && <p role="alert">{contentIssues[0]}</p>}
                <button className="eb-primary" disabled={busy || !sender || contentIssues.length > 0}>
                  {busy ? "Sending…" : "Send test"}
                </button>
              </form>
            )}
            {modal === "template" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await saveEmailTemplate({
                      organisationId,
                      userId,
                      template: {
                        name: templateName,
                        html,
                        designJson: draft.contentJson,
                        category: "custom",
                      },
                    });
                    await refresh();
                    setNotice("Template saved to your agency library.");
                    setModal("");
                  });
                }}
              >
                <h2>Save as template</h2>
                <label className="eb-field">
                  Template name
                  <input
                    required
                    maxLength={140}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </label>
                <button className="eb-primary" disabled={busy}>
                  Save template
                </button>
              </form>
            )}
            {modal === "sender" && (
              <>
                <h2>Set up your sending domain</h2>
                <p>
                  Add your agency domain once. We will generate the DNS records
                  your administrator needs to publish before a sender can be
                  verified.
                </p>
                <form
                  className="eb-domain-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const domain = new FormData(e.currentTarget).get("domain");
                    void run(async () => {
                      const result = await createEmailSendingDomain({
                        organisationId,
                        domain,
                      });
                      await refresh();
                      setNotice(
                        result.created
                          ? "Domain set up. Add the DNS records below, then refresh verification."
                          : "This domain is already set up for your agency.",
                      );
                    });
                  }}
                >
                  <label className="eb-field">
                    Sending domain
                    <input
                      name="domain"
                      type="text"
                      required
                      placeholder="updates.youragency.co.za"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <small>
                      Use a domain or subdomain your agency controls. A dedicated
                      subdomain keeps campaign reputation separate from normal mail.
                    </small>
                  </label>
                  <button className="eb-primary" disabled={busy}>
                    {busy ? "Setting up…" : "Set up domain"}
                  </button>
                </form>
                {domains.length > 0 && (
                  <div className="eb-domain-list" aria-live="polite">
                    <h3>Sending domains</h3>
                    {domains.map((domain) => (
                      <article key={domain.id}>
                        <div className="eb-domain-heading">
                          <strong>{domain.domain_name}</strong>
                          <span className={`eb-domain-status is-${domain.verification_status}`}>
                            {domain.verification_status}
                          </span>
                        </div>
                        {domain.last_provider_error && (
                          <p className="eb-domain-error">{domain.last_provider_error}</p>
                        )}
                        {Array.isArray(domain.dns_records) && domain.dns_records.length > 0 ? (
                          <div className="eb-dns-records">
                            <p>Add each record in your DNS provider:</p>
                            {domain.dns_records.map((record, index) => (
                              <div className="eb-dns-record" key={`${record.name}-${record.type}-${index}`}>
                                <div>
                                  <strong>{record.record || record.type}</strong>
                                  <small>{record.type} · {record.name}{record.priority ? ` · Priority ${record.priority}` : ""}</small>
                                  <code>{record.value}</code>
                                </div>
                                <button type="button" onClick={() => void copyDnsRecord(record)}>
                                  <Copy size={14} /> Copy
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="eb-domain-help">DNS records will appear here once the provider finishes setup.</p>
                        )}
                        {domain.verification_status !== "verified" && (
                          <button
                            className="eb-domain-verify"
                            type="button"
                            disabled={busy || !domain.provider_domain_id}
                            onClick={() => void run(async () => {
                              const result = await verifyEmailSendingDomain({ organisationId, domainId: domain.id });
                              await refresh();
                              setNotice(
                                result.domain?.status === "verified"
                                  ? `${domain.domain_name} is verified and matching senders are ready.`
                                  : `Verification started for ${domain.domain_name}. Resend is checking the DNS records.`,
                              );
                            })}
                          >
                            Verify DNS with Resend
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                <h3 className="eb-sender-heading">Add a sender address</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      if (!sendingDomain) throw new Error("Choose the sending domain for this address.");
                      const addressDomain = senderEmail.trim().toLowerCase().split("@").at(-1);
                      if (addressDomain !== sendingDomain.domain_name) {
                        throw new Error(`Use an address ending in @${sendingDomain.domain_name}.`);
                      }
                      await createEmailSender({
                        organisationId,
                        userId,
                        displayName: senderName,
                        email: senderEmail,
                        sendingDomainId,
                      });
                      await refresh();
                      setNotice(
                        "Sender added. It becomes available once its domain is verified.",
                      );
                    });
                  }}
                >
                  <label className="eb-field">
                    Display name
                    <input
                      required
                      maxLength={120}
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                    />
                  </label>
                  <label className="eb-field">
                    Sending domain
                    <select
                      required
                      value={sendingDomainId}
                      onChange={(e) => setSendingDomainId(e.target.value)}
                    >
                      <option value="">Select a domain</option>
                      {domains.map((domain) => (
                        <option value={domain.id} key={domain.id}>
                          {domain.domain_name} · {domain.verification_status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="eb-field">
                    Sending email
                    <input
                      type="email"
                      required
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder={sendingDomain ? `marketing@${sendingDomain.domain_name}` : "marketing@youragency.co.za"}
                    />
                  </label>
                  <button disabled={busy || !sendingDomain}>Add sender</button>
                </form>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result =
                        await refreshEmailSenderVerification(organisationId);
                      await refresh();
                      setNotice(
                        `${result.domainsVerified || 0} of ${result.domainsChecked || 0} sending domains verified.`,
                      );
                    })
                  }
                >
                  Refresh verification
                </button>
              </>
            )}
            {modal === "brand" && (
              <>
                <h2>Email brand defaults</h2>
                <p>
                  These defaults apply to this email. Individually styled blocks
                  keep their settings.
                </p>
                <label className="eb-field">
                  Logo URL
                  <input
                    type="url"
                    value={draft.contentJson.globalStyles.logoUrl || ""}
                    onChange={(e) =>
                      changeDocument({
                        ...draft.contentJson,
                        globalStyles: {
                          ...draft.contentJson.globalStyles,
                          logoUrl: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Apply this logo to every header block in this email?",
                      )
                    )
                      changeDocument({
                        ...draft.contentJson,
                        blocks: draft.contentJson.blocks.map((b) =>
                          b.type === "header"
                            ? {
                                ...b,
                                src: draft.contentJson.globalStyles.logoUrl,
                              }
                            : b,
                        ),
                      });
                  }}
                >
                  Apply logo to headers
                </button>
                <label className="eb-field">
                  Font
                  <select
                    value={draft.contentJson.globalStyles.fontFamily}
                    onChange={(e) =>
                      changeDocument({
                        ...draft.contentJson,
                        globalStyles: {
                          ...draft.contentJson.globalStyles,
                          fontFamily: e.target.value,
                        },
                      })
                    }
                  >
                    {["Arial", "Georgia", "Verdana"].map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {modal === "revisions" && (
              <>
                <h2>Draft revision history</h2>
                <p>
                  Restore a saved version; your current version stays in
                  history.
                </p>
                {revisions.map((revision) => (
                  <button
                    className="eb-revision"
                    key={revision.id}
                    onClick={() =>
                      void run(async () => {
                        await persist();
                        const restored = { ...fromRow(revision.snapshot, brand), id: lastId.current, updatedAt: draftRef.current.updatedAt };
                        update(restored);
                        draftRef.current = restored;
                        await persist();
                        setModal("");
                        setNotice("Draft revision restored.");
                      })
                    }
                  >
                    <span>{revision.snapshot.name}</span>
                    <small>
                      {new Date(revision.created_at).toLocaleString()}
                    </small>
                  </button>
                ))}
                {!revisions.length && <p>No saved revisions yet.</p>}
              </>
            )}
            {error && (
              <p className="eb-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="eb-notice" role="status">
                {notice}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
