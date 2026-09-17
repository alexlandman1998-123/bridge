import { supabase } from "../../lib/supabaseClient";

function text(value = "") {
  return String(value || "").trim();
}

async function call(body) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token)
    throw new Error("Please sign in again before reviewing completed reports.");
  const response = await fetch("/api/knowledge-factory/report-canvassing", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      text(payload?.error) ||
        `Completed report request failed (HTTP ${response.status}).`,
    );
  return payload || {};
}

export function listKnowledgeFactoryCompletedReports({ organisationId } = {}) {
  return call({ action: "list", organisationId: text(organisationId) });
}

export function convertKnowledgeFactoryReportToProspect({
  organisationId,
  reportResultId,
  firstName,
  lastName,
  phone,
  email,
  nextFollowUpDate,
  followUpPriority,
  followUpNote,
} = {}) {
  return call({
    action: "convert",
    organisationId: text(organisationId),
    reportResultId: text(reportResultId),
    firstName: text(firstName),
    lastName: text(lastName),
    phone: text(phone),
    email: text(email),
    nextFollowUpDate: text(nextFollowUpDate),
    followUpPriority: text(followUpPriority),
    followUpNote: text(followUpNote),
  });
}
