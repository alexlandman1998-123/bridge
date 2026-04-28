import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "supabase";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

type JsonRecord = Record<string, unknown>;

type GenerateOtpRequest = {
  transactionId?: string;
  transaction_id?: string;
  specialConditions?: string;
  special_conditions?: string;
  templatePath?: string;
  template_path?: string;
  templateBucket?: string;
  template_bucket?: string;
  templateBase64?: string;
  template_base64?: string;
  templateFilename?: string;
  template_filename?: string;
  outputBucket?: string;
  output_bucket?: string;
  generatedByUserId?: string;
  generated_by_user_id?: string;
  generatedByRole?: string;
  generated_by_role?: string;
  clientVisible?: boolean;
  client_visible?: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCurrency(value: unknown) {
  const amount = normalizeNumber(value);
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function sanitizePart(value: unknown, fallback: string) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeBase64ToBytes(base64Value: string) {
  const normalized = base64Value.includes(",") ? base64Value.split(",").pop() || "" : base64Value;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseBucketCandidates(...values: (string | undefined)[]) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function inferTemplateFileName(path: string) {
  const normalized = normalizeText(path);
  if (!normalized) return "otp-template.docx";
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "otp-template.docx";
}

function pickOnboardingValue(formData: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = formData[key];
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function formatDate(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isMissingSchemaError(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  return code === "42P01" || code === "PGRST205";
}

function isMissingColumnError(error: unknown, columnName = "") {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  const normalizedColumnName = normalizeText(columnName).toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("column") && (!normalizedColumnName || message.includes(normalizedColumnName)))
  );
}

function buildPlaceholderMap({
  transaction,
  buyer,
  unit,
  development,
  onboardingFormData,
  specialConditions,
}: {
  transaction: Record<string, unknown>;
  buyer: Record<string, unknown>;
  unit: Record<string, unknown>;
  development: Record<string, unknown>;
  onboardingFormData: Record<string, unknown>;
  specialConditions: string;
}) {
  const onboarding = onboardingFormData || {};
  const buyerFullName = firstNonEmpty(
    buyer?.name,
    `${pickOnboardingValue(onboarding, ["first_name", "buyer_first_name"]) } ${pickOnboardingValue(onboarding, ["last_name", "buyer_last_name"])}`,
  ).trim();
  const purchasePrice = normalizeNumber(transaction?.purchase_price ?? transaction?.sales_price);
  const depositAmount = normalizeNumber(transaction?.deposit_amount);
  const bondAmount = normalizeNumber(transaction?.bond_amount);

  const propertyAddress = [
    normalizeText(unit?.address_line1),
    normalizeText(unit?.suburb),
    normalizeText(unit?.city),
    normalizeText(unit?.province),
  ]
    .filter(Boolean)
    .join(", ");

  const sellerName = firstNonEmpty(
    transaction?.seller_name,
    pickOnboardingValue(onboarding, ["seller_name", "seller_full_name", "seller_entity_name"]),
    development?.developer_company,
  );

  const sellerReg = firstNonEmpty(
    transaction?.seller_registration_number,
    pickOnboardingValue(onboarding, ["seller_registration_number", "seller_id_number"]),
  );

  const maritalStatus = firstNonEmpty(
    pickOnboardingValue(onboarding, ["marital_status", "purchase_marital_status"]),
    transaction?.purchaser_type,
  );

  const map = {
    buyer_full_name: buyerFullName,
    buyer_id_number: firstNonEmpty(
      buyer?.id_number,
      pickOnboardingValue(onboarding, ["identity_number", "id_number", "passport_number"]),
    ),
    buyer_email: firstNonEmpty(buyer?.email, pickOnboardingValue(onboarding, ["email", "buyer_email"])),
    buyer_phone: firstNonEmpty(buyer?.phone, pickOnboardingValue(onboarding, ["phone", "buyer_phone", "mobile_number"])),
    buyer_marital_status: maritalStatus,
    buyer_address: firstNonEmpty(propertyAddress, pickOnboardingValue(onboarding, ["address_line1", "residential_address_line_1"])),
    seller_full_name: sellerName,
    seller_id_or_registration: sellerReg,
    development_name: firstNonEmpty(development?.name),
    property_unit: unit?.unit_number ? `Unit ${unit.unit_number}` : "",
    property_description: firstNonEmpty(
      unit?.description,
      `${firstNonEmpty(development?.name)} ${unit?.unit_number ? `Unit ${unit.unit_number}` : ""}`,
    ).trim(),
    property_address: propertyAddress,
    purchase_price: purchasePrice ? String(purchasePrice) : "",
    purchase_price_formatted: toCurrency(purchasePrice),
    transaction_reference: firstNonEmpty(transaction?.transaction_reference, transaction?.id),
    finance_type: firstNonEmpty(transaction?.finance_type, pickOnboardingValue(onboarding, ["finance_type", "purchase_finance_type"])),
    deposit_amount: depositAmount ? String(depositAmount) : "",
    deposit_amount_formatted: depositAmount ? toCurrency(depositAmount) : "",
    deposit_due_date: formatDate(pickOnboardingValue(onboarding, ["deposit_due_date"])),
    offer_date: formatDate(transaction?.created_at),
    occupation_date: formatDate(transaction?.expected_transfer_date),
    agent_name: firstNonEmpty(transaction?.assigned_agent, pickOnboardingValue(onboarding, ["agent_name"])),
    agency_name: firstNonEmpty(pickOnboardingValue(onboarding, ["agency_name"])),
    developer_company_name: firstNonEmpty(development?.developer_company),
    conveyancer_name: firstNonEmpty(transaction?.attorney, pickOnboardingValue(onboarding, ["conveyancer_name", "attorney_name"])),
    conveyancer_email: firstNonEmpty(transaction?.assigned_attorney_email, pickOnboardingValue(onboarding, ["conveyancer_email", "attorney_email"])),
    bond_amount: bondAmount ? String(bondAmount) : "",
    bond_amount_formatted: bondAmount ? toCurrency(bondAmount) : "",
    bank_name: firstNonEmpty(transaction?.bank, pickOnboardingValue(onboarding, ["bank", "bank_name"])),
    special_conditions: normalizeText(specialConditions),
  } as Record<string, string>;

  return map;
}

async function downloadTemplateBytes({
  supabase,
  templateBase64,
  templateBucket,
  templatePath,
  bucketCandidates,
}: {
  supabase: ReturnType<typeof createClient>;
  templateBase64: string;
  templateBucket: string;
  templatePath: string;
  bucketCandidates: string[];
}) {
  if (templateBase64) {
    return decodeBase64ToBytes(templateBase64);
  }

  const path = normalizeText(templatePath);
  if (!path) {
    throw new Error("Template source missing. Provide templatePath/template_bucket or templateBase64.");
  }

  const candidates = templateBucket ? [templateBucket, ...bucketCandidates] : bucketCandidates;
  let lastError: unknown = null;

  for (const bucket of [...new Set(candidates.filter(Boolean))]) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (!error && data) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      return bytes;
    }
    lastError = error;
  }

  throw new Error(`Unable to download template '${path}'. ${lastError ? JSON.stringify(lastError) : ""}`.trim());
}

async function insertSalesDocumentRecord({
  supabase,
  transactionId,
  fileName,
  filePath,
  specialConditions,
  clientVisible,
  generatedByRole,
  generatedByUserId,
}: {
  supabase: ReturnType<typeof createClient>;
  transactionId: string;
  fileName: string;
  filePath: string;
  specialConditions: string;
  clientVisible: boolean;
  generatedByRole: string;
  generatedByUserId: string | null;
}) {
  const now = new Date().toISOString();

  const salesInsert = await supabase
    .from("sales_documents")
    .insert({
      transaction_id: transactionId,
      name: fileName,
      file_path: filePath,
      document_type: "otp_draft",
      status: "draft_generated",
      special_conditions: specialConditions || null,
      client_visible: clientVisible,
      generated_by_role: generatedByRole || null,
      generated_by_user_id: generatedByUserId,
      created_at: now,
      updated_at: now,
    })
    .select("id, transaction_id, name, file_path, document_type, status, client_visible, created_at")
    .single();

  if (!salesInsert.error) {
    return {
      sourceTable: "sales_documents",
      record: salesInsert.data,
    };
  }

  const code = String((salesInsert.error as { code?: string })?.code || "");
  const message = String((salesInsert.error as { message?: string })?.message || "").toLowerCase();
  const canFallback =
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("sales_documents");

  if (!canFallback) {
    throw salesInsert.error;
  }

  const docsInsert = await supabase
    .from("documents")
    .insert({
      transaction_id: transactionId,
      name: fileName,
      file_path: filePath,
      category: "sales_documents",
      document_type: "otp_draft",
      visibility_scope: clientVisible ? "shared" : "internal",
      is_client_visible: clientVisible,
      uploaded_by_role: generatedByRole || null,
      uploaded_by_user_id: generatedByUserId,
      stage_key: "otp_prep_signing",
      created_at: now,
      updated_at: now,
    })
    .select("id, transaction_id, name, file_path, category, document_type, is_client_visible, created_at")
    .single();

  if (docsInsert.error) {
    throw docsInsert.error;
  }

  return {
    sourceTable: "documents",
    record: docsInsert.data,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed." });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const payload = (await req.json()) as GenerateOtpRequest;
    const transactionId = normalizeText(payload.transactionId || payload.transaction_id);
    if (!transactionId) {
      return jsonResponse(400, { success: false, error: "transactionId is required." });
    }

    const specialConditions = normalizeText(payload.specialConditions || payload.special_conditions);
    const templatePath = normalizeText(payload.templatePath || payload.template_path || Deno.env.get("OTP_TEMPLATE_PATH"));
    const templateBucket = normalizeText(payload.templateBucket || payload.template_bucket || Deno.env.get("OTP_TEMPLATE_BUCKET"));
    const templateBase64 = normalizeText(payload.templateBase64 || payload.template_base64);
    const templateFilename = normalizeText(payload.templateFilename || payload.template_filename || inferTemplateFileName(templatePath));
    const outputBucket = normalizeText(payload.outputBucket || payload.output_bucket || Deno.env.get("OTP_OUTPUT_BUCKET"));
    const generatedByRole = normalizeText(payload.generatedByRole || payload.generated_by_role) || "developer";
    const generatedByUserId = normalizeText(payload.generatedByUserId || payload.generated_by_user_id) || null;
    const clientVisible = Boolean(payload.clientVisible ?? payload.client_visible ?? false);

    const bucketCandidates = parseBucketCandidates(
      Deno.env.get("SUPABASE_DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_DOCUMENT_BUCKET"),
      Deno.env.get("DOCUMENTS_BUCKET"),
      Deno.env.get("SUPABASE_STORAGE_BUCKET"),
      "documents",
    );

    const outputBucketName = outputBucket || bucketCandidates[0] || "documents";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let transactionQuery = await supabase
      .from("transactions")
      .select(
        "id, transaction_reference, development_id, unit_id, buyer_id, purchase_price, sales_price, cash_amount, bond_amount, deposit_amount, finance_type, purchaser_type, attorney, assigned_attorney_email, assigned_agent, bank, stage, current_main_stage, created_at, expected_transfer_date, seller_name, seller_registration_number",
      )
      .eq("id", transactionId)
      .maybeSingle();

    if (
      transactionQuery.error &&
      (isMissingColumnError(transactionQuery.error, "seller_name") ||
        isMissingColumnError(transactionQuery.error, "seller_registration_number") ||
        isMissingColumnError(transactionQuery.error, "assigned_attorney_email") ||
        isMissingColumnError(transactionQuery.error, "assigned_agent") ||
        isMissingColumnError(transactionQuery.error, "transaction_reference"))
    ) {
      transactionQuery = await supabase
        .from("transactions")
        .select(
          "id, development_id, unit_id, buyer_id, purchase_price, sales_price, cash_amount, bond_amount, deposit_amount, finance_type, purchaser_type, attorney, bank, stage, current_main_stage, created_at, expected_transfer_date",
        )
        .eq("id", transactionId)
        .maybeSingle();
    }

    if (transactionQuery.error) {
      throw transactionQuery.error;
    }

    if (!transactionQuery.data) {
      return jsonResponse(404, { success: false, error: "Transaction not found." });
    }

    const transaction = transactionQuery.data as Record<string, unknown>;

    const buyerPromise = transaction.buyer_id
      ? supabase.from("buyers").select("id, name, email, phone").eq("id", String(transaction.buyer_id)).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const);

    const unitPromise = transaction.unit_id
      ? supabase
          .from("units")
          .select("id, development_id, unit_number, description, property_type, address_line1, suburb, city, province")
          .eq("id", String(transaction.unit_id))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const);

    const onboardingPromise = supabase
      .from("onboarding_form_data")
      .select("transaction_id, form_data")
      .eq("transaction_id", transactionId)
      .maybeSingle();

    const [buyerQuery, unitQuery, onboardingQuery] = await Promise.all([
      buyerPromise,
      unitPromise,
      onboardingPromise,
    ]);

    if (buyerQuery.error) throw buyerQuery.error;
    if (unitQuery.error) throw unitQuery.error;

    const unit = (unitQuery.data || {}) as Record<string, unknown>;
    const buyer = (buyerQuery.data || {}) as Record<string, unknown>;

    let development: Record<string, unknown> = {};
    const resolvedDevelopmentId = firstNonEmpty(transaction.development_id, unit.development_id);
    if (resolvedDevelopmentId) {
      const developmentQuery = await supabase
        .from("developments")
        .select("id, name, developer_company")
        .eq("id", resolvedDevelopmentId)
        .maybeSingle();

      if (developmentQuery.error) throw developmentQuery.error;
      development = (developmentQuery.data || {}) as Record<string, unknown>;
    }

    if (onboardingQuery.error && !isMissingSchemaError(onboardingQuery.error) && !isMissingColumnError(onboardingQuery.error)) {
      throw onboardingQuery.error;
    }

    const onboardingFormData =
      onboardingQuery.error || !onboardingQuery.data || typeof onboardingQuery.data.form_data !== "object"
        ? {}
        : (onboardingQuery.data.form_data as Record<string, unknown>);

    const placeholders = buildPlaceholderMap({
      transaction,
      buyer,
      unit,
      development,
      onboardingFormData,
      specialConditions,
    });

    const templateBytes = await downloadTemplateBytes({
      supabase,
      templateBase64,
      templateBucket,
      templatePath,
      bucketCandidates,
    });

    let zip: PizZip;
    try {
      zip = new PizZip(templateBytes);
    } catch (_error) {
      return jsonResponse(400, {
        success: false,
        error:
          "Template is not a valid .docx (zip) file. Convert the Word template to .docx and retry.",
      });
    }

    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{", end: "}" },
      paragraphLoop: true,
      linebreaks: true,
    });

    try {
      doc.render(placeholders);
    } catch (error) {
      console.error("OTP template render failed", error);
      return jsonResponse(400, {
        success: false,
        error: "Template render failed. Check placeholder names and provided data.",
        details: String(error),
      });
    }

    const outputBytes = doc.getZip().generate({ type: "uint8array" });
    const extension = templateFilename.toLowerCase().endsWith(".docx") ? "docx" : "docx";
    const generatedFileName = `${sanitizePart(development?.name, "development")}-${sanitizePart(unit?.unit_number ? `unit-${unit.unit_number}` : "unit", "unit")}-${sanitizePart(buyer?.name, "buyer")}-otp-${Date.now()}.${extension}`;
    const filePath = `transaction-${transactionId}/sales-documents/${generatedFileName}`;

    const uploadResult = await supabase.storage
      .from(outputBucketName)
      .upload(filePath, outputBytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    const inserted = await insertSalesDocumentRecord({
      supabase,
      transactionId,
      fileName: generatedFileName,
      filePath,
      specialConditions,
      clientVisible,
      generatedByRole,
      generatedByUserId,
    });

    const signedUrlResult = await supabase.storage
      .from(outputBucketName)
      .createSignedUrl(filePath, 60 * 60);

    return jsonResponse(200, {
      success: true,
      transactionId,
      output: {
        bucket: outputBucketName,
        filePath,
        fileName: generatedFileName,
        signedUrl: signedUrlResult.data?.signedUrl || null,
      },
      documentRecord: {
        table: inserted.sourceTable,
        data: inserted.record,
      },
      placeholdersUsed: placeholders,
    });
  } catch (error) {
    console.error("generate-otp failed", error);
    return jsonResponse(500, {
      success: false,
      error: String(error),
    });
  }
});
