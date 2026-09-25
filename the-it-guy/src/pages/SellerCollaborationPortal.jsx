import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SELLER_CHANGE_SENSITIVITIES } from "../services/listings/listingSellerCollaborationModel.js";
import {
  activateListingSellerParticipant,
  getListingSellerParticipantPayload,
  submitListingSellerChange,
  verifyListingSellerParticipant,
} from "../services/listings/listingSellerCollaborationService.js";

const FIELD_CATALOG = Object.freeze({
  legal_identity: [
    ["fullName", "Full legal name"],
    ["idNumber", "ID or passport number"],
    ["nationality", "Nationality"],
  ],
  ownership: [
    ["ownershipType", "Ownership type"],
    ["ownershipPercentage", "Ownership percentage"],
    ["titleDeedNumber", "Title deed number"],
  ],
  authority: [
    ["authorityRole", "Authority role"],
    ["resolutionReference", "Resolution / authority reference"],
    ["signingCapacity", "Signing capacity"],
  ],
  financial: [
    ["bondHolder", "Bond holder"],
    ["outstandingBond", "Outstanding bond"],
    ["incomeTaxNumber", "Income tax number"],
  ],
  compliance: [
    ["residentialAddress", "Residential address"],
    ["sourceOfFunds", "Source of funds"],
    ["popiConsent", "POPI consent"],
  ],
  general: [
    ["phone", "Phone"],
    ["preferredContactMethod", "Preferred contact method"],
    ["notes", "Notes"],
  ],
});

const storageKey = (participantId) =>
  `arch9:seller-participant:${participantId}`;
const text = (value) => String(value ?? "").trim();

export default function SellerCollaborationPortal() {
  const { invitationToken = "", participantId = "" } = useParams();
  const navigate = useNavigate();
  const isInvitation = Boolean(invitationToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessToken, setAccessToken] = useState(() =>
    participantId ? localStorage.getItem(storageKey(participantId)) || "" : "",
  );
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(Boolean(participantId && accessToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sensitivity, setSensitivity] = useState("general");
  const [draft, setDraft] = useState({});

  const fields = useMemo(
    () => FIELD_CATALOG[sensitivity] || FIELD_CATALOG.general,
    [sensitivity],
  );

  const load = useCallback(async (id = participantId, token = accessToken) => {
    if (!id || !token) return;
    try {
      setLoading(true);
      setError("");
      setPayload(await getListingSellerParticipantPayload(id, token));
    } catch (loadError) {
      localStorage.removeItem(storageKey(id));
      setAccessToken("");
      setError(
        loadError?.message || "Your secure session could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, participantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAccess(event) {
    event.preventDefault();
    if (password.length < 10)
      return setError("Use a password with at least 10 characters.");
    if (isInvitation && password !== confirmPassword)
      return setError("Passwords do not match.");
    try {
      setSaving(true);
      setError("");
      const session = isInvitation
        ? await activateListingSellerParticipant(invitationToken, password)
        : await verifyListingSellerParticipant(participantId, password);
      const nextParticipantId = session?.participant?.id || participantId;
      localStorage.setItem(storageKey(nextParticipantId), session.accessToken);
      setAccessToken(session.accessToken);
      setPassword("");
      setConfirmPassword("");
      if (isInvitation) {
        navigate(`/seller/collaboration/member/${nextParticipantId}`, {
          replace: true,
        });
      } else {
        await load(nextParticipantId, session.accessToken);
      }
    } catch (accessError) {
      setError(accessError?.message || "Seller Portal access failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const proposedPatch = Object.fromEntries(
      Object.entries(draft).filter(([, value]) => text(value)),
    );
    const changedFields = Object.keys(proposedPatch);
    if (!changedFields.length)
      return setError("Enter at least one proposed change.");
    try {
      setSaving(true);
      setError("");
      await submitListingSellerChange({
        participantId,
        accessToken,
        sensitivity,
        proposedPatch,
        changedFields,
        expectedVersion: payload?.participant?.recordVersion,
      });
      setDraft({});
      setMessage(
        sensitivity === "general"
          ? "Your update was submitted."
          : "Your protected change was sent to the agent for review. It has not changed the legal record yet.",
      );
      await load();
    } catch (submitError) {
      setError(
        submitError?.code === "40001"
          ? "Another change was saved first. The latest record has been loaded; please review and submit again."
          : submitError?.message || "The change could not be submitted.",
      );
      if (submitError?.code === "40001") await load();
    } finally {
      setSaving(false);
    }
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[#f3f6f8] px-4 py-12">
        <section className="mx-auto max-w-md rounded-[24px] border border-[#dce5ed] bg-white p-6 shadow-xl">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf6ef] text-[#146c43]">
            <LockKeyhole />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-[#142132]">
            {isInvitation
              ? "Activate your Seller Portal"
              : "Open your Seller Portal"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#607387]">
            This access is personal to you. Other owners and representatives
            receive their own invitation and information scope.
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleAccess}>
            <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11 rounded-xl border border-[#ccd9e5] px-3"
              />
            </label>
            {isInvitation ? (
              <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="min-h-11 rounded-xl border border-[#ccd9e5] px-3"
                />
              </label>
            ) : null}
            {error ? (
              <p className="rounded-xl bg-[#fff1f1] p-3 text-sm text-[#9f2929]">
                {error}
              </p>
            ) : null}
            <button
              disabled={saving || loading}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#073f30] px-4 font-semibold text-white disabled:opacity-60"
            >
              {saving || loading ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}
              {isInvitation ? "Activate secure access" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f6f8] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-[24px] bg-[#073f30] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a9d6c5]">
            Your scoped seller workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            {payload.participant?.name}
          </h1>
          <p className="mt-1 text-sm text-[#d5e9e1]">
            {payload.listing?.title || payload.listing?.address} ·{" "}
            {text(payload.participant?.role).replaceAll("_", " ")}
          </p>
        </header>
        <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <article className="rounded-[22px] border border-[#dce5ed] bg-white p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-[#187446]" />
              <div>
                <h2 className="font-semibold text-[#142132]">
                  Propose an update
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#607387]">
                  Identity, ownership, authority, financial and compliance
                  changes remain proposed until an authorised reviewer accepts
                  them.
                </p>
              </div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-semibold text-[#2d445e]">
                Area
                <select
                  value={sensitivity}
                  onChange={(event) => {
                    setSensitivity(event.target.value);
                    setDraft({});
                  }}
                  className="min-h-11 rounded-xl border border-[#ccd9e5] px-3"
                >
                  {SELLER_CHANGE_SENSITIVITIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {fields.map(([key, label]) => (
                <label
                  key={key}
                  className="grid gap-2 text-sm font-semibold text-[#2d445e]"
                >
                  {label}
                  <input
                    value={draft[key] || ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    className="min-h-11 rounded-xl border border-[#ccd9e5] px-3"
                  />
                </label>
              ))}
              {error ? (
                <p className="rounded-xl bg-[#fff1f1] p-3 text-sm text-[#9f2929]">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="rounded-xl bg-[#edf8f1] p-3 text-sm text-[#187446]">
                  {message}
                </p>
              ) : null}
              <button
                disabled={saving}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-[#073f30] px-4 font-semibold text-white disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Send size={17} />
                )}
                Submit for review
              </button>
            </form>
          </article>
          <article className="rounded-[22px] border border-[#dce5ed] bg-white p-5">
            <h2 className="font-semibold text-[#142132]">Your submissions</h2>
            <div className="mt-4 space-y-3">
              {(payload.changeRequests || []).length ? (
                payload.changeRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-[#e3eaf0] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold capitalize text-[#2d445e]">
                        {text(request.sensitivity).replaceAll("_", " ")}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${request.status === "approved" ? "bg-[#edf8f1] text-[#187446]" : request.status === "rejected" || request.status === "conflict" ? "bg-[#fff1f1] text-[#9f2929]" : "bg-[#fff7e8] text-[#8a641d]"}`}
                      >
                        {request.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#607387]">
                      {(request.changed_fields || []).join(", ")}
                    </p>
                    {request.review_note ? (
                      <p className="mt-2 text-sm text-[#425970]">
                        {request.review_note}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#607387]">
                  No changes submitted yet.
                </p>
              )}
            </div>
            <div className="mt-5 rounded-xl border border-[#dce6f2] bg-[#f7fbff] p-3 text-sm text-[#425970]">
              <p className="font-semibold">Access boundary</p>
              <p className="mt-1">
                You can see your own submissions, notifications and assigned
                sections only. Other sellers’ identity, financial and compliance
                information is not included.
              </p>
            </div>
            {(payload.notifications || []).some(
              (item) => item.status === "failed",
            ) ? (
              <div className="mt-3 flex gap-2 rounded-xl bg-[#fff1f1] p-3 text-sm text-[#9f2929]">
                <CircleAlert size={17} />A message failed to send. Your agent
                can see it and retry.
              </div>
            ) : (
              <div className="mt-3 flex gap-2 rounded-xl bg-[#edf8f1] p-3 text-sm text-[#187446]">
                <CheckCircle2 size={17} />
                Message delivery issues will be shown here.
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
