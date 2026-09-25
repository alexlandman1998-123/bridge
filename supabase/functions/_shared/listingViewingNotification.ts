type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

export function listingViewingDeliveryDecision(
  job: Row,
  appointment: Row | null,
  round: Row | null,
  participant: Row | null,
  now = new Date(),
): "send" | "superseded" {
  if (!appointment || !round || !participant || !text(participant.email)) {
    return "superseded";
  }
  if (text(job.appointment_id) !== text(appointment.appointment_id) ||
    text(job.appointment_id) !== text(round.appointment_id) ||
    text(job.participant_id) !== text(participant.participant_id) ||
    Number(job.round_number) !== Number(round.round_number)) {
    return "superseded";
  }

  const kind = text(job.event_kind);
  const appointmentStatus = lower(appointment.status);
  const roundStatus = lower(round.status);
  if (kind === "request" || kind === "changed_time") {
    const expiresAt = Date.parse(text(round.expires_at));
    return Number(appointment.listing_viewing_round_number) === Number(job.round_number) &&
        appointmentStatus === "requested" && roundStatus === "requested" &&
        lower(participant.rsvp_status) === "pending" &&
        !text(participant.rsvp_revoked_at) && Boolean(text(participant.rsvp_token)) &&
        Number.isFinite(expiresAt) && expiresAt > now.getTime()
      ? "send"
      : "superseded";
  }
  if (kind === "confirmed") {
    return appointmentStatus === "confirmed" && roundStatus === "confirmed"
      ? "send"
      : "superseded";
  }
  if (kind === "declined") {
    return appointmentStatus === "declined" && roundStatus === "declined"
      ? "send"
      : "superseded";
  }
  if (kind === "cancelled") {
    return appointmentStatus === "cancelled" ? "send" : "superseded";
  }
  return "superseded";
}

export function buildListingViewingEmailPayload({
  job,
  appointment,
  participant,
  agent = {},
  appUrl,
}: {
  job: Row;
  appointment: Row;
  participant: Row;
  agent?: Row;
  appUrl: string;
}) {
  const kind = text(job.event_kind);
  const needsResponse = kind === "request" || kind === "changed_time";
  const token = needsResponse ? text(participant.rsvp_token) : "";
  const baseUrl = text(appUrl).replace(/\/$/, "");
  const actionLink = token
    ? `${baseUrl}/appointment-rsvp/${encodeURIComponent(token)}`
    : "";
  const message = kind === "changed_time"
    ? "A new viewing time was proposed. Earlier approvals no longer apply. Please respond to this new time; the viewing is not booked until all three parties agree."
    : kind === "request"
    ? "Please confirm whether this viewing time suits you. The viewing is not booked until the buyer, seller and agent all agree."
    : kind === "confirmed"
    ? "The buyer, seller and agent have all accepted this viewing time. Your viewing is booked."
    : kind === "declined"
    ? "A participant declined the proposed viewing. This viewing has not been booked."
    : "This viewing has been cancelled.";
  const eventType = needsResponse
    ? "appointment_confirmation_required"
    : kind === "confirmed"
    ? "appointment_confirmed"
    : "appointment_cancelled";
  // Appointment notes are agent-entered and can contain private buyer or seller
  // context. Only the workflow message belongs in a three-party email.
  const notes = message;
  const agentEmail = text(agent.email).toLowerCase();
  return {
    type: eventType,
    to: lower(participant.email),
    organisationId: text(job.organisation_id),
    appointmentId: text(job.appointment_id),
    participantId: text(job.participant_id),
    appointmentType: "Viewing",
    appointmentTitle: kind === "changed_time"
      ? `New time proposed: ${text(appointment.title) || "Property viewing"}`
      : text(appointment.title) || "Property viewing",
    appointmentDate: text(appointment.appointment_date),
    appointmentTime: text(appointment.start_time).slice(0, 5),
    appointmentEndTime: text(appointment.end_time).slice(0, 5),
    timezone: text(appointment.timezone) || "Africa/Johannesburg",
    location: text(appointment.location) || "To be confirmed",
    status: kind === "confirmed" ? "Confirmed" : needsResponse ? "Requested" : "Cancelled",
    recipientName: text(participant.name) || "there",
    participantRole: text(participant.participant_role),
    agentName: text(agent.full_name) || text(agent.name),
    agentEmail,
    replyTo: agentEmail,
    relatedListing: text(appointment.location),
    notes,
    actionLink,
    acceptLink: token ? `${actionLink}?action=accept` : "",
    declineLink: token ? `${actionLink}?action=decline` : "",
    rescheduleLink: token ? `${actionLink}?action=reschedule` : "",
    attachCalendarInvite: kind === "confirmed",
    bccAgent: false,
    idempotencyKey: ["listing-viewing", job.appointment_id, job.round_number,
      job.participant_id, kind].map(text).join(":"),
  };
}
