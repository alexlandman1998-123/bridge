import { createClient } from "supabase";
import {
  renderBridgeBullets,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSteps,
  renderBridgeSummaryCard,
} from "../content/bridgeEmailLayout.ts";
import { sendViaResendApi } from "../services/resend.ts";
import type {
  SendTransactionRoleplayerHandoffPayload,
  SendTransactionRoleplayerIntroPayload,
} from "../types.ts";
import {
  isMissingColumnError,
  isMissingSchemaError,
  isMissingTableError,
} from "../utils/db.ts";
import { jsonResponse } from "../utils/http.ts";
import { normalizeText } from "../utils/text.ts";

function formatMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function isBondFinance(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return ["bond", "combination", "hybrid"].includes(normalized);
}

function normalizeUuidText(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function firstContactName(...values: unknown[]) {
  return values.map((value) => normalizeText(value)).find(Boolean) || "";
}

function firstContactEmail(...values: unknown[]) {
  return values.map((value) => normalizeText(value).toLowerCase()).find(
    Boolean,
  ) || "";
}

function buildPropertyTitle({
  development,
  unit,
  transaction,
}: {
  development: Record<string, unknown> | null;
  unit: Record<string, unknown> | null;
  transaction: Record<string, unknown>;
}) {
  const developmentName = normalizeText(development?.name);
  const unitNumber = normalizeText(unit?.unit_number);
  const address = [
    transaction.property_address_line_1,
    transaction.suburb,
    transaction.city,
  ].map((value) => normalizeText(value)).filter(Boolean).join(", ");
  return [
    developmentName,
    unitNumber ? `Unit ${unitNumber}` : "",
  ].filter(Boolean).join(" • ") ||
    normalizeText(transaction.property_description) ||
    address ||
    "the property";
}

async function fetchParticipants(supabase: any, transactionId: string) {
  const query = await supabase
    .from("transaction_participants")
    .select(
      "id, role_type, legal_role, status, participant_name, participant_email",
    )
    .eq("transaction_id", transactionId);

  if (query.error) {
    if (
      isMissingTableError(query.error, "transaction_participants") ||
      isMissingSchemaError(query.error) ||
      isMissingColumnError(query.error, "legal_role") ||
      isMissingColumnError(query.error, "status")
    ) {
      return [];
    }
    throw query.error;
  }

  return Array.isArray(query.data) ? query.data : [];
}

async function logIntroEmailEvent({
  supabase,
  transactionId,
  recipientEmail,
  emailId,
  transferAttorneyName,
  transferAttorneyEmail,
  bondOriginatorName,
  bondOriginatorEmail,
  agentName,
  agentEmail,
}: {
  supabase: any;
  transactionId: string;
  recipientEmail: string;
  emailId: string | null;
  transferAttorneyName: string;
  transferAttorneyEmail: string;
  bondOriginatorName: string;
  bondOriginatorEmail: string;
  agentName: string;
  agentEmail: string;
}) {
  try {
    const insertResult = await supabase.from("transaction_events").insert({
      transaction_id: transactionId,
      event_type: "RoleplayerIntroEmailSent",
      event_data: {
        title: "Transaction team introduced",
        description:
          "The buyer was sent the transfer attorney, finance roleplayer, and agent handoff details.",
        recipientEmail,
        emailId,
        visibility: "client_visible",
        audience: "buyer",
        actionLabel: "View Team",
        actionRoute: "team",
        transferAttorneyName,
        transferAttorneyEmail,
        bondOriginatorName,
        bondOriginatorEmail,
        agentName,
        agentEmail,
        source: "send-email",
      },
      created_by_role: "system",
    });
    if (
      insertResult.error &&
      !isMissingTableError(insertResult.error, "transaction_events") &&
      !isMissingSchemaError(insertResult.error)
    ) {
      console.error("[roleplayer_intro] audit log failed", insertResult.error);
    }
  } catch (error) {
    console.error("[roleplayer_intro] audit log failed", error);
  }
}

async function logHandoffEmailEvent({
  supabase,
  transactionId,
  recipients,
  transferAttorneyName,
  transferAttorneyEmail,
  bondOriginatorName,
  bondOriginatorEmail,
  agentName,
  agentEmail,
}: {
  supabase: any;
  transactionId: string;
  recipients: Array<{ role: string; email: string; emailId: string | null }>;
  transferAttorneyName: string;
  transferAttorneyEmail: string;
  bondOriginatorName: string;
  bondOriginatorEmail: string;
  agentName: string;
  agentEmail: string;
}) {
  try {
    const insertResult = await supabase.from("transaction_events").insert({
      transaction_id: transactionId,
      event_type: "RoleplayerHandoffEmailSent",
      event_data: {
        title: "Roleplayer handoff sent",
        description:
          "The transfer and finance roleplayers were sent the transaction handoff context.",
        recipients,
        transferAttorneyName,
        transferAttorneyEmail,
        bondOriginatorName,
        bondOriginatorEmail,
        agentName,
        agentEmail,
        visibility: "internal_only",
        source: "send-email",
      },
      created_by_role: "system",
    });
    if (
      insertResult.error &&
      !isMissingTableError(insertResult.error, "transaction_events") &&
      !isMissingSchemaError(insertResult.error)
    ) {
      console.error(
        "[roleplayer_handoff] audit log failed",
        insertResult.error,
      );
    }
  } catch (error) {
    console.error("[roleplayer_handoff] audit log failed", error);
  }
}

function buildRoleplayerHandoffContent({
  recipientRole,
  propertyTitle,
  buyerName,
  buyerEmail,
  buyerPhone,
  sellerName,
  sellerEmail,
  financeType,
  purchasePrice,
  transactionReference,
  transferAttorneyName,
  transferAttorneyEmail,
  bondOriginatorName,
  bondOriginatorEmail,
  agentName,
  agentEmail,
}: {
  recipientRole: "transfer_attorney" | "bond_originator";
  propertyTitle: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  sellerName: string;
  sellerEmail: string;
  financeType: string;
  purchasePrice: string;
  transactionReference: string;
  transferAttorneyName: string;
  transferAttorneyEmail: string;
  bondOriginatorName: string;
  bondOriginatorEmail: string;
  agentName: string;
  agentEmail: string;
}) {
  const roleTitle = recipientRole === "transfer_attorney"
    ? "Transfer Attorney"
    : "Bond Originator";
  const roleSteps = recipientRole === "transfer_attorney"
    ? [
      "Open or update your matter record against this transaction reference.",
      "Review the buyer and seller details and contact the buyer if transfer documents or FICA items are needed.",
      "Coordinate with the agent and finance roleplayer so transfer preparation stays aligned.",
      "Share progress updates back through Arch9 as the legal workflow moves forward.",
    ]
    : [
      "Contact the buyer to confirm their finance application requirements and outstanding documents.",
      "Track bank submission, feedback, approval, and grant or guarantee readiness.",
      "Keep the agent and transfer attorney informed of finance milestones that affect transfer timing.",
      "Share progress updates back through Arch9 as the finance workflow moves forward.",
    ];

  const summaryRows = [
    { label: "Property", value: propertyTitle },
    {
      label: "Buyer",
      value: [buyerName, buyerEmail, buyerPhone].filter(Boolean).join(" • "),
    },
    {
      label: "Seller",
      value: [sellerName, sellerEmail].filter(Boolean).join(" • "),
    },
    { label: "Finance Type", value: financeType },
    { label: "Purchase Price", value: purchasePrice },
    { label: "Transaction Reference", value: transactionReference },
  ];
  const teamRows = [
    {
      label: "Transfer Attorney",
      value: [transferAttorneyName, transferAttorneyEmail].filter(Boolean).join(
        " • ",
      ),
    },
    {
      label: "Bond Originator",
      value: [bondOriginatorName, bondOriginatorEmail].filter(Boolean).join(
        " • ",
      ),
    },
    {
      label: "Agent",
      value: [agentName, agentEmail].filter(Boolean).join(" • "),
    },
  ];

  return {
    roleTitle,
    contentHtml: [
      renderBridgeIntroParagraphs([
        `You have been added as the ${roleTitle.toLowerCase()} for ${propertyTitle}.`,
        "This handoff gives you the core transaction context and the immediate next steps expected from your side.",
      ]),
      renderBridgeSummaryCard(summaryRows, "Transaction Summary"),
      renderBridgeSummaryCard(teamRows, "Current Roleplayers"),
      `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
         <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Expected next steps</p>
         ${renderBridgeSteps(roleSteps)}
       </div>`,
      `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #f7fbff;">
         <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">Useful context</p>
         ${
        renderBridgeBullets([
          "The buyer has received or will receive a separate introduction naming the confirmed roleplayers.",
          "Bank-appointed bond attorney details can be added later once the bank confirms instruction.",
          "If any contact detail is incorrect, reply to this email so the transaction record can be corrected.",
        ])
      }
       </div>`,
    ].join(""),
    text: [
      `You have been added as the ${roleTitle.toLowerCase()} for ${propertyTitle}.`,
      "",
      "Transaction summary:",
      ...summaryRows.filter((row) => row.value).map((row) =>
        `${row.label}: ${row.value}`
      ),
      "",
      "Current roleplayers:",
      ...teamRows.filter((row) => row.value).map((row) =>
        `${row.label}: ${row.value}`
      ),
      "",
      "Expected next steps:",
      ...roleSteps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Useful context:",
      "- The buyer has received or will receive a separate introduction naming the confirmed roleplayers.",
      "- Bank-appointed bond attorney details can be added later once the bank confirms instruction.",
      "- If any contact detail is incorrect, reply to this email so the transaction record can be corrected.",
    ].join("\n"),
  };
}

export async function handleTransactionRoleplayerIntroEmail(
  payload: SendTransactionRoleplayerIntroPayload,
) {
  const transactionId = normalizeText(payload.transactionId);
  if (!transactionId) {
    return jsonResponse(400, {
      error: "Missing required field: transactionId",
    });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let transactionQuery = await supabase
    .from("transactions")
    .select(
      "id, buyer_id, development_id, unit_id, transaction_reference, finance_type, purchase_price, sales_price, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, property_description, property_address_line_1, suburb, city, province",
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (
    transactionQuery.error &&
    (
      isMissingColumnError(transactionQuery.error, "assigned_agent") ||
      isMissingColumnError(transactionQuery.error, "assigned_agent_email") ||
      isMissingColumnError(transactionQuery.error, "assigned_attorney_email") ||
      isMissingColumnError(
        transactionQuery.error,
        "assigned_bond_originator_email",
      ) ||
      isMissingColumnError(transactionQuery.error, "property_address_line_1")
    )
  ) {
    transactionQuery = await supabase
      .from("transactions")
      .select(
        "id, buyer_id, development_id, unit_id, transaction_reference, finance_type, purchase_price, sales_price, attorney, bond_originator, property_description",
      )
      .eq("id", transactionId)
      .maybeSingle();
  }

  if (transactionQuery.error) {
    return jsonResponse(500, {
      error: transactionQuery.error.message || "Failed to load transaction.",
      code: transactionQuery.error.code || null,
    });
  }

  const transaction = transactionQuery.data as Record<string, unknown> | null;
  if (!transaction) {
    return jsonResponse(404, { error: "Transaction not found." });
  }
  const buyerId = normalizeUuidText(transaction.buyer_id);
  const unitId = normalizeUuidText(transaction.unit_id);
  const developmentId = normalizeUuidText(transaction.development_id);

  const [buyerQuery, unitQuery, developmentQuery, participants] = await Promise
    .all([
      buyerId
        ? supabase.from("buyers").select("id, name, email").eq(
          "id",
          buyerId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      unitId
        ? supabase.from("units").select("id, unit_number").eq(
          "id",
          unitId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      developmentId
        ? supabase.from("developments").select("id, name").eq(
          "id",
          developmentId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchParticipants(supabase, transactionId),
    ]);

  if (buyerQuery.error) {
    return jsonResponse(500, {
      error: buyerQuery.error.message || "Failed to load buyer.",
      code: buyerQuery.error.code || null,
    });
  }

  const activeParticipants = participants.filter((
    participant: Record<string, unknown>,
  ) => normalizeText(participant.status).toLowerCase() !== "removed");
  const transferParticipant = activeParticipants.find((
    participant: Record<string, unknown>,
  ) =>
    normalizeText(participant.role_type).toLowerCase() === "attorney" &&
    normalizeText(participant.legal_role).toLowerCase() === "transfer"
  );
  const bondOriginatorParticipant = activeParticipants.find((
    participant: Record<string, unknown>,
  ) =>
    normalizeText(participant.role_type).toLowerCase() === "bond_originator"
  );

  const buyerName = normalizeText(payload.recipientName) ||
    normalizeText(buyerQuery.data?.name) ||
    "there";
  const recipientEmail = normalizeText(payload.to).toLowerCase() ||
    normalizeText(buyerQuery.data?.email).toLowerCase();
  if (!recipientEmail) {
    return jsonResponse(400, {
      error:
        "Buyer email is missing. Capture buyer email before sending the roleplayer introduction.",
    });
  }

  const propertyTitle = buildPropertyTitle({
    development: developmentQuery.data || null,
    unit: unitQuery.data || null,
    transaction,
  });
  const transactionReference = normalizeText(transaction.transaction_reference);
  const financeType = normalizeText(transaction.finance_type) || "cash";
  const bondFinance = isBondFinance(financeType);
  const transferAttorneyName = firstContactName(
    transaction.attorney,
    transferParticipant?.participant_name,
  );
  const transferAttorneyEmail = firstContactEmail(
    transaction.assigned_attorney_email,
    transferParticipant?.participant_email,
  );
  const bondOriginatorName = firstContactName(
    transaction.bond_originator,
    bondOriginatorParticipant?.participant_name,
  );
  const bondOriginatorEmail = firstContactEmail(
    transaction.assigned_bond_originator_email,
    bondOriginatorParticipant?.participant_email,
  );
  const agentName = firstContactName(transaction.assigned_agent);
  const agentEmail = firstContactEmail(transaction.assigned_agent_email);
  const purchasePrice = formatMoney(
    transaction.purchase_price || transaction.sales_price,
  );
  const organisationName =
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
  const supportEmail = normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone = normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  const sender = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  if (!transferAttorneyName && !transferAttorneyEmail) {
    return jsonResponse(400, {
      error:
        "Transfer attorney is missing. Capture a transfer attorney before sending the roleplayer introduction.",
    });
  }

  if (bondFinance && !bondOriginatorName && !bondOriginatorEmail) {
    return jsonResponse(400, {
      error:
        "Bond originator is missing for this financed transaction. Capture the originator before sending the introduction.",
    });
  }

  const roleplayerRows = [
    {
      label: "Transfer Attorney",
      value: [transferAttorneyName || "To be confirmed", transferAttorneyEmail]
        .filter(Boolean).join(" • "),
    },
    bondFinance
      ? {
        label: "Bond Originator",
        value: [bondOriginatorName || "To be confirmed", bondOriginatorEmail]
          .filter(Boolean).join(" • "),
      }
      : null,
    {
      label: "Agent",
      value: [agentName, agentEmail].filter(Boolean).join(" • "),
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const nextSteps = [
    "Your transfer attorney will guide the transfer process and confirm the legal documents or information they need from you.",
    bondFinance
      ? "Your bond originator or finance team may contact you about finance documents, bank feedback, and approval progress."
      : "Because this is not marked as a bond transaction, finance follow-up will focus on proof of funds and any payment milestones that apply.",
    "Your agent remains your first point of contact for sale-related questions and will help coordinate between the parties.",
    "Arch9 will keep the transaction record, documents, and next steps coordinated as the matter progresses.",
  ];

  const subject = transactionReference
    ? `Your transaction team is confirmed (${transactionReference})`
    : "Your transaction team is confirmed";
  const contentHtml = [
    renderBridgeIntroParagraphs([
      `Congratulations again on your accepted offer for ${propertyTitle}.`,
      "The transaction team is now being introduced so you know who may contact you, what each person handles, and what to expect next.",
    ]),
    renderBridgeSummaryCard(
      [
        { label: "Property", value: propertyTitle },
        { label: "Purchase Price", value: purchasePrice },
        { label: "Finance Type", value: financeType },
        { label: "Transaction Reference", value: transactionReference },
      ],
      "Transaction Summary",
    ),
    renderBridgeSummaryCard(roleplayerRows, "Your Roleplayers"),
    `<div style="margin: 0 0 16px; padding: 14px; border: 1px solid #dbe6f2; border-radius: 12px; background: #ffffff;">
       <p style="margin: 0 0 10px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #5f7590; font-weight: 700;">What happens next</p>
       ${renderBridgeSteps(nextSteps)}
     </div>`,
  ].join("");

  const html = renderBridgeEmailLayout({
    preheader: `Your transaction team for ${propertyTitle} has been confirmed.`,
    title: "Your Transaction Team",
    greeting: `Hi ${buyerName},`,
    contentHtml,
    securityTitle: "Secure Transaction Coordination",
    securityBody:
      "Your transaction details are shared only with authorised parties involved in your matter.",
    helpBody: "Need help? Reply to this email or contact your agent directly.",
    organisationName,
    supportEmail,
    supportPhone,
  });

  const text = [
    `Hi ${buyerName},`,
    "",
    `Congratulations again on your accepted offer for ${propertyTitle}.`,
    "The transaction team is now being introduced so you know who may contact you, what each person handles, and what to expect next.",
    "",
    `Property: ${propertyTitle}`,
    purchasePrice ? `Purchase Price: ${purchasePrice}` : null,
    `Finance Type: ${financeType}`,
    transactionReference
      ? `Transaction Reference: ${transactionReference}`
      : null,
    "",
    "Your roleplayers:",
    ...roleplayerRows.map((row) => `${row.label}: ${row.value}`),
    "",
    "What happens next:",
    ...nextSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Need help? Reply to this email or contact your agent directly.",
    "",
    organisationName,
    "Powered by Arch9",
  ].filter(Boolean).join("\n");

  const emailResult = await sendViaResendApi({
    apiKey: resendApiKey,
    from: sender,
    to: recipientEmail,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    return jsonResponse(500, {
      error: emailResult.error?.message ||
        "Failed to send roleplayer introduction.",
      details: emailResult.error,
    });
  }

  await logIntroEmailEvent({
    supabase,
    transactionId,
    recipientEmail,
    emailId: emailResult.data?.id || null,
    transferAttorneyName,
    transferAttorneyEmail,
    bondOriginatorName,
    bondOriginatorEmail,
    agentName,
    agentEmail,
  });

  return jsonResponse(200, {
    ok: true,
    type: "transaction_roleplayer_intro",
    transactionId,
    recipientEmail,
    emailId: emailResult.data?.id || null,
  });
}

export async function handleTransactionRoleplayerHandoffEmail(
  payload: SendTransactionRoleplayerHandoffPayload,
) {
  const transactionId = normalizeText(payload.transactionId);
  if (!transactionId) {
    return jsonResponse(400, {
      error: "Missing required field: transactionId",
    });
  }

  const supabaseUrl = normalizeText(Deno.env.get("SUPABASE_URL"));
  const serviceRoleKey = normalizeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const resendApiKey = normalizeText(Deno.env.get("RESEND_API_KEY"));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
    });
  }
  if (!resendApiKey) {
    return jsonResponse(500, { error: "Missing RESEND_API_KEY secret." });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let transactionQuery = await supabase
    .from("transactions")
    .select(
      "id, buyer_id, development_id, unit_id, transaction_reference, finance_type, purchase_price, sales_price, assigned_agent, assigned_agent_email, attorney, assigned_attorney_email, bond_originator, assigned_bond_originator_email, seller_name, seller_email, seller_phone, property_description, property_address_line_1, suburb, city, province",
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (
    transactionQuery.error &&
    (
      isMissingColumnError(transactionQuery.error, "assigned_agent") ||
      isMissingColumnError(transactionQuery.error, "assigned_agent_email") ||
      isMissingColumnError(transactionQuery.error, "assigned_attorney_email") ||
      isMissingColumnError(
        transactionQuery.error,
        "assigned_bond_originator_email",
      ) ||
      isMissingColumnError(transactionQuery.error, "seller_name") ||
      isMissingColumnError(transactionQuery.error, "seller_email") ||
      isMissingColumnError(transactionQuery.error, "seller_phone") ||
      isMissingColumnError(transactionQuery.error, "property_address_line_1")
    )
  ) {
    transactionQuery = await supabase
      .from("transactions")
      .select(
        "id, buyer_id, development_id, unit_id, transaction_reference, finance_type, purchase_price, sales_price, attorney, bond_originator, property_description",
      )
      .eq("id", transactionId)
      .maybeSingle();
  }

  if (transactionQuery.error) {
    return jsonResponse(500, {
      error: transactionQuery.error.message || "Failed to load transaction.",
      code: transactionQuery.error.code || null,
    });
  }

  const transaction = transactionQuery.data as Record<string, unknown> | null;
  if (!transaction) {
    return jsonResponse(404, { error: "Transaction not found." });
  }
  const buyerId = normalizeUuidText(transaction.buyer_id);
  const unitId = normalizeUuidText(transaction.unit_id);
  const developmentId = normalizeUuidText(transaction.development_id);

  const [buyerQuery, unitQuery, developmentQuery, participants] = await Promise
    .all([
      buyerId
        ? supabase.from("buyers").select("id, name, email, phone").eq(
          "id",
          buyerId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      unitId
        ? supabase.from("units").select("id, unit_number").eq(
          "id",
          unitId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      developmentId
        ? supabase.from("developments").select("id, name").eq(
          "id",
          developmentId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchParticipants(supabase, transactionId),
    ]);

  if (buyerQuery.error) {
    return jsonResponse(500, {
      error: buyerQuery.error.message || "Failed to load buyer.",
      code: buyerQuery.error.code || null,
    });
  }

  const activeParticipants = participants.filter((
    participant: Record<string, unknown>,
  ) => normalizeText(participant.status).toLowerCase() !== "removed");
  const transferParticipant = activeParticipants.find((
    participant: Record<string, unknown>,
  ) =>
    normalizeText(participant.role_type).toLowerCase() === "attorney" &&
    normalizeText(participant.legal_role).toLowerCase() === "transfer"
  );
  const bondOriginatorParticipant = activeParticipants.find((
    participant: Record<string, unknown>,
  ) =>
    normalizeText(participant.role_type).toLowerCase() === "bond_originator"
  );

  const propertyTitle = buildPropertyTitle({
    development: developmentQuery.data || null,
    unit: unitQuery.data || null,
    transaction,
  });
  const financeType = normalizeText(transaction.finance_type) || "cash";
  const bondFinance = isBondFinance(financeType);
  const transactionReference = normalizeText(transaction.transaction_reference);
  const purchasePrice = formatMoney(
    transaction.purchase_price || transaction.sales_price,
  );
  const buyerName = normalizeText(buyerQuery.data?.name) || "Buyer";
  const buyerEmail = normalizeText(buyerQuery.data?.email).toLowerCase();
  const buyerPhone = normalizeText(buyerQuery.data?.phone);
  const sellerName = normalizeText(transaction.seller_name);
  const sellerEmail = normalizeText(transaction.seller_email).toLowerCase();
  const transferAttorneyName = firstContactName(
    transaction.attorney,
    transferParticipant?.participant_name,
  );
  const transferAttorneyEmail = firstContactEmail(
    transaction.assigned_attorney_email,
    transferParticipant?.participant_email,
  );
  const bondOriginatorName = firstContactName(
    transaction.bond_originator,
    bondOriginatorParticipant?.participant_name,
  );
  const bondOriginatorEmail = firstContactEmail(
    transaction.assigned_bond_originator_email,
    bondOriginatorParticipant?.participant_email,
  );
  const agentName = firstContactName(transaction.assigned_agent);
  const agentEmail = firstContactEmail(transaction.assigned_agent_email);

  const recipients = [
    transferAttorneyEmail
      ? {
        role: "transfer_attorney" as const,
        name: transferAttorneyName || "Transfer Attorney",
        email: transferAttorneyEmail,
      }
      : null,
    bondFinance && bondOriginatorEmail
      ? {
        role: "bond_originator" as const,
        name: bondOriginatorName || "Bond Originator",
        email: bondOriginatorEmail,
      }
      : null,
  ].filter(Boolean) as Array<{
    role: "transfer_attorney" | "bond_originator";
    name: string;
    email: string;
  }>;

  if (!recipients.length) {
    return jsonResponse(200, {
      ok: true,
      type: "transaction_roleplayer_handoff",
      sent: false,
      reason: "missing_roleplayer_emails",
      transactionId,
      missing: {
        transferAttorneyEmail: !transferAttorneyEmail,
        bondOriginatorEmail: bondFinance && !bondOriginatorEmail,
      },
    });
  }

  const organisationName =
    normalizeText(Deno.env.get("BRIDGE_ORGANISATION_NAME")) ||
    normalizeText(Deno.env.get("ORGANISATION_NAME")) ||
    "Arch9";
  const supportEmail = normalizeText(Deno.env.get("BRIDGE_SUPPORT_EMAIL")) ||
    normalizeText(Deno.env.get("SUPPORT_EMAIL"));
  const supportPhone = normalizeText(Deno.env.get("BRIDGE_SUPPORT_PHONE")) ||
    normalizeText(Deno.env.get("SUPPORT_PHONE"));
  const sender = normalizeText(Deno.env.get("RESEND_FROM_EMAIL")) ||
    "Arch9 <onboarding@resend.dev>";

  const sentRecipients: Array<{
    role: string;
    email: string;
    emailId: string | null;
  }> = [];
  const failures: Array<{ role: string; email: string; error: unknown }> = [];

  for (const recipient of recipients) {
    const { roleTitle, contentHtml, text } = buildRoleplayerHandoffContent({
      recipientRole: recipient.role,
      propertyTitle,
      buyerName,
      buyerEmail,
      buyerPhone,
      sellerName,
      sellerEmail,
      financeType,
      purchasePrice,
      transactionReference,
      transferAttorneyName,
      transferAttorneyEmail,
      bondOriginatorName,
      bondOriginatorEmail,
      agentName,
      agentEmail,
    });
    const subject = transactionReference
      ? `New transaction handoff: ${propertyTitle} (${transactionReference})`
      : `New transaction handoff: ${propertyTitle}`;
    const html = renderBridgeEmailLayout({
      preheader:
        `You have been added as ${roleTitle.toLowerCase()} for ${propertyTitle}.`,
      title: "Transaction Handoff",
      greeting: `Hi ${recipient.name},`,
      contentHtml,
      securityTitle: "Secure Transaction Coordination",
      securityBody:
        "This handoff contains transaction context for authorised roleplayers only. Please handle buyer and seller information confidentially.",
      helpBody:
        "Need anything corrected? Reply to this email so the Arch9 team can update the transaction record.",
      organisationName,
      supportEmail,
      supportPhone,
    });
    const fullText = [
      `Hi ${recipient.name},`,
      "",
      text,
      "",
      "Need anything corrected? Reply to this email so the Arch9 team can update the transaction record.",
      "",
      organisationName,
      "Powered by Arch9",
    ].join("\n");
    const emailResult = await sendViaResendApi({
      apiKey: resendApiKey,
      from: sender,
      to: recipient.email,
      subject,
      html,
      text: fullText,
    });
    if (!emailResult.ok) {
      failures.push({
        role: recipient.role,
        email: recipient.email,
        error: emailResult.error,
      });
      continue;
    }
    sentRecipients.push({
      role: recipient.role,
      email: recipient.email,
      emailId: emailResult.data?.id || null,
    });
  }

  if (sentRecipients.length) {
    await logHandoffEmailEvent({
      supabase,
      transactionId,
      recipients: sentRecipients,
      transferAttorneyName,
      transferAttorneyEmail,
      bondOriginatorName,
      bondOriginatorEmail,
      agentName,
      agentEmail,
    });
  }

  if (failures.length) {
    return jsonResponse(500, {
      error: "Failed to send one or more roleplayer handoff emails.",
      sentRecipients,
      failures,
    });
  }

  return jsonResponse(200, {
    ok: true,
    type: "transaction_roleplayer_handoff",
    transactionId,
    sentRecipients,
  });
}
