import {
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Button from "../ui/Button.jsx";
import Field from "../ui/Field.jsx";
import { SELLER_PARTICIPANT_ROLES } from "../../services/listings/listingSellerCollaborationModel.js";
import {
  getListingSellerCollaborationWorkspace,
  inviteListingSellerParticipant,
  retryListingSellerNotification,
  reviewListingSellerChange,
} from "../../services/listings/listingSellerCollaborationService.js";

const EMPTY_INVITE = { displayName: "", email: "", role: "primary_owner" };
const label = (value) => String(value || "").replaceAll("_", " ");

export default function ListingSellerCollaborationPanel({
  listing,
  onChanged = null,
}) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [reviewNotes, setReviewNotes] = useState({});
  const [feedback, setFeedback] = useState({ tone: "", message: "" });

  const load = useCallback(async () => {
    if (!listing?.id) return;
    try {
      setLoading(true);
      setWorkspace(await getListingSellerCollaborationWorkspace(listing.id));
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error?.message || "Seller collaboration could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  }, [listing?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvite(values = invite) {
    const key = `invite:${values.email}`;
    try {
      setAction(key);
      setFeedback({ tone: "", message: "" });
      await inviteListingSellerParticipant({
        listingId: listing.id,
        displayName: values.displayName,
        email: values.email,
        role: values.role,
        authorityScope:
          values.role === "primary_owner"
            ? ["legal_identity", "ownership", "authority", "financial", "compliance", "documents", "signature"]
            : ["legal_identity", "ownership", "authority", "compliance", "documents", "signature"],
        propertyTitle:
          listing.title ||
          listing.formattedAddress ||
          listing.addressLine1 ||
          "the property",
        agencyName: listing.organisationName || "",
      });
      setInvite(EMPTY_INVITE);
      setInviteOpen(false);
      setFeedback({
        tone: "success",
        message: `A private invitation was sent to ${values.email}.`,
      });
      await load();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: `${error?.message || "Invitation failed."} The failure is recorded and can be retried.`,
      });
      await load();
    } finally {
      setAction("");
    }
  }

  async function review(request, decision) {
    try {
      setAction(`${decision}:${request.id}`);
      setFeedback({ tone: "", message: "" });
      const result = await reviewListingSellerChange({
        request,
        listing,
        decision,
        note: reviewNotes[request.id] || "",
      });
      const conflict = result?.status === "conflict";
      setFeedback({
        tone: conflict ? "error" : "success",
        message: conflict
          ? "This record changed after the seller submitted it. Nothing was overwritten; reload and compare the new values."
          : decision === "approve"
            ? "The reviewed change is now in the canonical seller record."
            : "The change was returned to the seller.",
      });
      await load();
      if (!conflict && decision === "approve") await onChanged?.();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error?.code === "40001"
            ? "A concurrent edit was detected. Nothing was overwritten; refresh and review again."
            : error?.message || "The review could not be saved.",
      });
      await load();
    } finally {
      setAction("");
    }
  }

  async function retryNotification(notification) {
    try {
      setAction(`notification:${notification.id}`);
      setFeedback({ tone: "", message: "" });
      await retryListingSellerNotification(notification.id);
      setFeedback({
        tone: "success",
        message: "The failed message was returned to the delivery queue.",
      });
      await load();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error?.message || "The message could not be retried.",
      });
    } finally {
      setAction("");
    }
  }

  const participants = workspace?.participants || [];
  const openChanges = (workspace?.changeRequests || []).filter((request) =>
    ["pending", "conflict"].includes(request.status),
  );
  const failedNotifications = (workspace?.notifications || []).filter(
    (notification) => notification.status === "failed",
  );

  return (
    <article
      className="rounded-[24px] border border-[#d8e6f2] bg-[#fbfdff] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]"
      data-testid="seller-collaboration-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#187446]" />
            <h3 className="text-base font-semibold text-[#142132]">
              Seller collaboration and permissions
            </h3>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#607387]">
            Each owner or representative receives personal access. Protected
            edits stay proposed until reviewed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setInviteOpen((value) => !value)}
          >
            <Plus size={14} />
            Add participant
          </Button>
        </div>
      </div>
      {feedback.message ? (
        <p
          className={`mt-4 rounded-xl p-3 text-sm ${feedback.tone === "error" ? "bg-[#fff1f1] text-[#9f2929]" : "bg-[#edf8f1] text-[#187446]"}`}
        >
          {feedback.message}
        </p>
      ) : null}
      {inviteOpen ? (
        <form
          className="mt-4 grid gap-3 rounded-[16px] border border-[#dce6f2] bg-white p-4 md:grid-cols-[1fr_1fr_0.8fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void sendInvite();
          }}
        >
          <Field
            required
            value={invite.displayName}
            onChange={(event) =>
              setInvite((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
            placeholder="Participant name"
          />
          <Field
            required
            type="email"
            value={invite.email}
            onChange={(event) =>
              setInvite((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            placeholder="seller@example.com"
          />
          <Field
            as="select"
            value={invite.role}
            onChange={(event) =>
              setInvite((current) => ({ ...current, role: event.target.value }))
            }
          >
            {SELLER_PARTICIPANT_ROLES.map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </Field>
          <Button type="submit" disabled={Boolean(action)}>
            {action ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Send
          </Button>
        </form>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#dce6f2] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f5f9fc] text-xs text-[#607387]">
            <tr>
              <th className="px-3 py-2">Participant</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Invitation</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {participants.length ? (
              participants.map((participant) => (
                <tr key={participant.id} className="border-t border-[#edf2f7]">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[#243d56]">
                      {participant.displayName}
                    </p>
                    <p className="text-xs text-[#607387]">
                      {participant.email}
                    </p>
                  </td>
                  <td className="px-3 py-3 capitalize text-[#425970]">
                    {label(participant.role)}
                  </td>
                  <td className="px-3 py-3 capitalize text-[#425970]">
                    {participant.status}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`capitalize ${participant.invitationStatus === "failed" ? "font-semibold text-[#9f2929]" : "text-[#425970]"}`}
                    >
                      {label(participant.invitationStatus)}
                    </span>
                    {participant.invitationError ? (
                      <p className="mt-1 max-w-xs text-xs text-[#9f2929]">
                        {participant.invitationError}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {participant.invitationStatus === "failed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void sendInvite({
                            displayName: participant.displayName,
                            email: participant.email,
                            role: participant.role,
                          })
                        }
                        disabled={Boolean(action)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#dbe6f2] px-2 py-1.5 text-xs font-semibold text-[#35546c] disabled:opacity-50"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="5"
                  className="px-4 py-8 text-center text-[#607387]"
                >
                  No participant-specific access has been created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {failedNotifications.length ? (
        <div className="mt-4 rounded-[16px] border border-[#f1caca] bg-[#fff5f5] p-4">
          <h4 className="font-semibold text-[#8f2929]">Failed seller messages</h4>
          <div className="mt-3 space-y-2">
            {failedNotifications.map((notification) => (
              <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                <div>
                  <p className="text-sm font-semibold text-[#5f2b2b]">{notification.subject || label(notification.type)}</p>
                  <p className="mt-1 text-xs text-[#9f4a4a]">{notification.recipientEmail || "Seller"} · {notification.error || "Delivery failed"}</p>
                </div>
                <button type="button" onClick={() => void retryNotification(notification)} disabled={Boolean(action)} className="inline-flex items-center gap-1 rounded-lg border border-[#efcaca] px-2 py-1.5 text-xs font-semibold text-[#8f2929] disabled:opacity-50">
                  {action === `notification:${notification.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Retry message
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {openChanges.length ? (
        <div className="mt-4 rounded-[16px] border border-[#f2dfbd] bg-[#fffaf0] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-[#6d5015]">
                Changes requiring attention
              </h4>
              <p className="mt-1 text-xs leading-5 text-[#7a5a17]">
                Approval writes through the canonical seller save. A stale
                listing, onboarding record or participant version becomes a
                conflict instead of overwriting data.
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#7a5a17]">
              {openChanges.length}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {openChanges.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-[#ead7ad] bg-white p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#243d56]">
                      {request.participantName || "Seller"} ·{" "}
                      <span className="capitalize">
                        {label(request.sensitivity)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[#607387]">
                      {request.changedFields.join(", ") || "Seller details"}
                    </p>
                  </div>
                  {request.status === "conflict" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1f1] px-2 py-1 text-xs font-semibold text-[#9f2929]">
                      <CircleAlert size={12} />
                      Conflict
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {Object.entries(request.proposedPatch).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg bg-[#f7fafc] px-3 py-2"
                    >
                      <dt className="text-xs font-semibold capitalize text-[#708398]">
                        {label(key)}
                      </dt>
                      <dd className="mt-1 break-words text-[#243d56]">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {request.status === "pending" ? (
                  <>
                    <Field
                      className="mt-3"
                      value={reviewNotes[request.id] || ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="Review note (required when returning a change)"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!request.canReview || Boolean(action)}
                        onClick={() => void review(request, "approve")}
                      >
                        {action === `approve:${request.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={14} />
                        )}
                        Approve reviewed values
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          !request.canReview ||
                          Boolean(action) ||
                          !(reviewNotes[request.id] || "").trim()
                        }
                        onClick={() => void review(request, "reject")}
                      >
                        Return to seller
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs font-semibold text-[#9f2929]">
                    Reload the current seller record and ask the seller to
                    resubmit against the latest version.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2 rounded-[14px] border border-[#dce6f2] bg-white p-3 text-xs leading-5 text-[#607387]">
        <UserRound size={16} className="mt-0.5 shrink-0 text-[#52708d]" />
        Agents can manage participants and review identity, ownership and
        authority. Financial and compliance changes require a manager or
        compliance reviewer. Sellers never receive another participant’s
        protected information.
      </div>
    </article>
  );
}
