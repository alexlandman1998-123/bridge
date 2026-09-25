import {
  buildListingViewingEmailPayload,
  listingViewingDeliveryDecision,
} from "./listingViewingNotification.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const job = {
  id: "job-1",
  appointment_id: "appointment-1",
  organisation_id: "org-1",
  round_number: 2,
  participant_id: "participant-1",
  event_kind: "changed_time",
};
const appointment = {
  appointment_id: "appointment-1",
  listing_viewing_round_number: 2,
  status: "requested",
  title: "Viewing: 12 Example Street",
  appointment_date: "2099-09-25",
  start_time: "14:00:00",
  location: "12 Example Street",
  notes: "Internal: buyer finance and seller identity details",
};
const round = {
  appointment_id: "appointment-1",
  round_number: 2,
  status: "requested",
  expires_at: "2099-09-24T12:00:00Z",
};
const participant = {
  participant_id: "participant-1",
  email: "buyer@example.com",
  name: "Buyer",
  participant_role: "Buyer",
  rsvp_status: "Pending",
  rsvp_token: "new-round-token",
};

Deno.test("changed time sends only the active round link", () => {
  assert(listingViewingDeliveryDecision(job, appointment, round, participant) === "send", "active invitation should send");
  assert(listingViewingDeliveryDecision(job, { ...appointment, listing_viewing_round_number: 3 }, round, participant) === "superseded", "old round must not send");
  assert(listingViewingDeliveryDecision(job, appointment, { ...round, status: "superseded" }, participant) === "superseded", "closed round must not send");
  assert(listingViewingDeliveryDecision(job, appointment, round, { ...participant, rsvp_status: "Accepted" }) === "superseded", "answered participant needs no new request");
  const payload = buildListingViewingEmailPayload({ job, appointment, participant, appUrl: "https://app.arch9.co.za" });
  assert(payload.type === "appointment_confirmation_required", "changed time must request confirmation");
  assert(payload.acceptLink.includes("new-round-token"), "new round token should be linked");
  assert(payload.notes.includes("Earlier approvals no longer apply"), "reapproval must be explicit");
  assert(payload.attachCalendarInvite === false, "request must not appear booked in a calendar");
  assert(payload.bccAgent === false, "agent must not receive duplicate BCC emails");
  assert(!payload.notes.includes("buyer finance"), "internal appointment notes must not be emailed to participants");
});

Deno.test("expired, superseded and missing-contact requests are not emailed", () => {
  const now = new Date("2099-09-24T12:00:01Z");
  assert(listingViewingDeliveryDecision(job, appointment, round, participant, now) === "superseded", "expired request must not send");
  assert(listingViewingDeliveryDecision(job, appointment, round, { ...participant, email: "" }) === "superseded", "missing email must not send");
  assert(listingViewingDeliveryDecision(job, appointment, round, { ...participant, rsvp_revoked_at: "2099-09-23T12:00:00Z" }) === "superseded", "revoked invite must not send");
  assert(listingViewingDeliveryDecision(job, appointment, round, { ...participant, rsvp_token: "" }) === "superseded", "missing token must not send");
});

Deno.test("confirmation waits for a confirmed round and has no RSVP links", () => {
  const confirmedJob = { ...job, event_kind: "confirmed" };
  assert(listingViewingDeliveryDecision(confirmedJob, appointment, round, participant) === "superseded", "pending request is not booked");
  assert(listingViewingDeliveryDecision(confirmedJob, { ...appointment, status: "confirmed" }, { ...round, status: "confirmed" }, participant) === "send", "confirmed round should notify");
  const payload = buildListingViewingEmailPayload({ job: confirmedJob, appointment, participant, appUrl: "https://app.arch9.co.za" });
  assert(payload.type === "appointment_confirmed", "booking must use confirmation template");
  assert(payload.actionLink === "" && payload.acceptLink === "", "booking email must not reuse RSVP token");
  assert(payload.attachCalendarInvite === true, "booked viewing should have calendar invite");
});

Deno.test("declines and later cancellations notify all parties without old links", () => {
  const declinedJob = { ...job, event_kind: "declined" };
  assert(listingViewingDeliveryDecision(declinedJob, { ...appointment, status: "declined" }, { ...round, status: "declined" }, participant) === "send", "decline should notify");
  const cancelledJob = { ...job, event_kind: "cancelled" };
  assert(listingViewingDeliveryDecision(cancelledJob, { ...appointment, status: "cancelled" }, { ...round, status: "confirmed" }, participant) === "send", "confirmed viewing cancellation should notify");
  const payload = buildListingViewingEmailPayload({ job: cancelledJob, appointment, participant, appUrl: "https://app.arch9.co.za" });
  assert(payload.type === "appointment_cancelled", "cancellation should use cancellation email");
  assert(!("rsvpToken" in payload) && payload.actionLink === "", "cancelled viewing must not carry a live RSVP token");
});
