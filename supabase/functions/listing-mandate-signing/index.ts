import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderSellerSignedPdf } from "./sellerSignedPdf.ts";

type RecordValue = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const escapeHtml = (value: unknown) =>
  text(value).replace(
    /[&<>"']/g,
    (
      character,
    ) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character] || character),
  );
const email = (value: unknown) => text(value).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const documentKeys = new Set(["disclosure", "fica", "mandate"]);
// Keep the recipient journey and the frozen server-side pack in the same order.
// FICA establishes the seller/entity details that the later documents rely on.
const documentOrder = ["fica", "disclosure", "mandate"];
const orderDocuments = (value: unknown) =>
  documentOrder.filter((key) =>
    Array.isArray(value) &&
    value.some((item) => text(item).toLowerCase() === key)
  );
const disclosureQuestionKeys = [
  "electrical_faults",
  "illegal_electrical_extensions",
  "water_heater",
  "drainage_system",
  "leaking_taps_pipes",
  "keys_to_all_doors",
  "remote_controls",
  "security_systems",
  "pool_equipment",
  "pool_repairs_six_months",
  "rising_damp",
  "roof_leaks",
  "sanitary_fittings",
  "tiles_floors",
  "structural_defects",
  "carpet_damage",
  "cupboards",
  "door_window_locks",
  "improvements_on_plans",
  "approved_plans_possession",
];
const signingPackVersion = "seller_signing_pack_v1";
const signedPdfBucket = "documents";
const brandingSnapshotContract = "arch9-seller-signing-branding-snapshot-v1";
const response = (status: number, body: RecordValue) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const token = () =>
  crypto.getRandomValues(new Uint8Array(32)).reduce(
    (value, byte) => value + byte.toString(16).padStart(2, "0"),
    "",
  );
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function snapshot(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : {};
}
function signingPackStatusSummary(value: unknown) {
  const pack = snapshot(value);
  const seller = snapshot(pack.seller);
  return {
    selectedDocuments: orderDocuments(pack.selectedDocuments),
    frozenAt: text(pack.frozenAt),
    seller: {
      name: text(seller.name),
      firstName: text(seller.firstName),
      surname: text(seller.surname),
      legalType: text(seller.legalType),
      idNumber: text(seller.idNumber),
      dateOfBirth: text(seller.dateOfBirth),
      nationality: text(seller.nationality),
      countryOfResidence: text(seller.countryOfResidence),
      residentialAddress: text(seller.residentialAddress),
      incomeTaxNumber: text(seller.incomeTaxNumber),
      email: email(seller.email),
      phone: text(seller.phone),
      occupation: text(seller.occupation),
      sourceOfFunds: text(seller.sourceOfFunds),
      companyName: text(seller.companyName),
      companyRegistrationNumber: text(seller.companyRegistrationNumber),
      companyRegisteredAddress: text(seller.companyRegisteredAddress),
      trustName: text(seller.trustName),
      trustRegistrationNumber: text(seller.trustRegistrationNumber),
      trustRegisteredAddress: text(seller.trustRegisteredAddress),
    },
  };
}
function ficaDetailErrors(fica: RecordValue, seller: RecordValue = {}) {
  const errors = [] as string[];
  const legalType = text(seller.legalType).toLowerCase();
  const naturalPerson = ![
    "company",
    "close_corporation",
    "foreign_company",
    "trust",
    "foreign_trust",
    "deceased_estate",
  ].includes(legalType);
  const trust = ["trust", "foreign_trust"].includes(legalType);
  if (naturalPerson && !text(fica.firstName)) errors.push("first name");
  if (naturalPerson && !text(fica.surname)) errors.push("surname");
  if (naturalPerson && !text(fica.idNumber)) {
    errors.push("ID or passport number");
  }
  if (naturalPerson && !text(fica.dateOfBirth)) errors.push("date of birth");
  if (naturalPerson && !text(fica.residentialAddress)) {
    errors.push("residential address");
  }
  if (!naturalPerson && !text(fica.entityName)) {
    errors.push(trust ? "trust name" : "company name");
  }
  if (!naturalPerson && !text(fica.entityRegistrationNumber)) {
    errors.push(
      trust ? "trust registration number" : "company registration number",
    );
  }
  if (!naturalPerson && !text(fica.registeredAddress)) {
    errors.push("registered address");
  }
  return errors;
}
async function syncSigningSellerDetails(
  admin: any,
  session: RecordValue,
  fica: RecordValue,
) {
  const { data, error } = await admin.rpc(
    "bridge_update_listing_signing_seller_details",
    {
      p_session_id: session.id,
      p_seller: {
        firstName: text(fica.firstName),
        surname: text(fica.surname),
        idNumber: text(fica.idNumber),
        dateOfBirth: text(fica.dateOfBirth),
        nationality: text(fica.nationality),
        countryOfResidence: text(fica.countryOfResidence),
        residentialAddress: text(fica.residentialAddress),
        incomeTaxNumber: text(fica.incomeTaxNumber),
        email: email(fica.email),
        phone: text(fica.phone),
        occupation: text(fica.occupation),
        sourceOfFunds: text(fica.sourceOfFunds),
        entityName: text(fica.entityName),
        entityRegistrationNumber: text(fica.entityRegistrationNumber),
        registeredAddress: text(fica.registeredAddress),
      },
    },
  );
  const result = snapshot(data);
  const nextPack = snapshot(result.signingPack);
  if (error || !Object.keys(nextPack).length) {
    throw new Error(
      error?.message || "Seller details could not be saved. Please try again.",
    );
  }
  const digest = await hash(JSON.stringify(nextPack));
  let sessionUpdate = admin.from("private_listing_mandate_signing_sessions")
    .update({
      signing_pack_snapshot: nextPack,
      signing_pack_digest: digest,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active");
  sessionUpdate = text(session.signing_group_id)
    ? sessionUpdate.eq("signing_group_id", session.signing_group_id)
    : sessionUpdate.eq("id", session.id);
  const { error: sessionError } = await sessionUpdate;
  if (sessionError) {
    throw new Error("Seller details could not be saved. Please try again.");
  }
  return {
    signingPack: nextPack,
    signingPackDigest: digest,
    changedFields: Array.isArray(result.changedFields)
      ? result.changedFields
      : [],
  };
}
function signingPack(
  value: unknown,
  selectedDocuments: string[],
  mandate: RecordValue,
  frozenAt: string,
) {
  const provided = snapshot(value);
  const providedMandate = snapshot(provided.mandate);
  const selected = selectedDocuments.slice();
  return {
    ...provided,
    version: signingPackVersion,
    frozenAt,
    selectedDocuments: selected,
    mandate: Object.keys(providedMandate).length ? providedMandate : mandate,
    seller: snapshot(provided.seller),
    property: snapshot(provided.property),
    disclosure: snapshot(provided.disclosure),
    signers: Array.isArray(provided.signers) ? provided.signers : [],
    templateVersions: snapshot(provided.templateVersions),
  };
}

function isAuthoritativeBrandingSnapshot(value: unknown) {
  const branding = snapshot(value);
  return branding.contract === brandingSnapshotContract &&
    /^[0-9a-f]{64}$/i.test(text(branding.digest)) &&
    Boolean(text(branding.organisationId));
}

function isRecoverableLegacyPackBranding(value: unknown) {
  const branding = snapshot(value);
  return Boolean(
    text(branding.organisationName) &&
      (text(branding.primaryColour) || text(branding.secondaryColour) ||
        text(branding.accentColour)),
  );
}

async function fetchCanonicalSigningBranding(
  admin: any,
  organisationId: string,
) {
  const [brandingResult, organisationResult] = await Promise.all([
    admin.from("organisation_branding").select("*").eq(
      "organisation_id",
      organisationId,
    ).maybeSingle(),
    admin.from("organisations").select("*").eq("id", organisationId)
      .maybeSingle(),
  ]);
  if (brandingResult.error) {
    throw new Error("The agency branding record could not be loaded.");
  }
  if (organisationResult.error || !organisationResult.data) {
    throw new Error("The agency identity could not be loaded.");
  }
  const canonical = snapshot(brandingResult.data);
  const organisation = snapshot(organisationResult.data);
  return {
    organisationName: text(canonical.organisation_display_name) ||
      text(organisation.display_name) || text(organisation.name),
    website: text(canonical.website) || text(organisation.website),
    logoLightUrl: text(canonical.logo_light_url) || text(organisation.logo_url),
    logoDarkUrl: text(canonical.logo_dark_url) ||
      text(organisation.logo_dark_url) || text(canonical.logo_light_url) ||
      text(organisation.logo_url),
    logoIconUrl: text(canonical.logo_icon_url),
    primaryColour: text(canonical.primary_brand_color) ||
      text(organisation.primary_colour) || "#173f5f",
    secondaryColour: text(canonical.secondary_brand_color) ||
      text(organisation.secondary_colour) || "#102a43",
    accentColour: text(canonical.accent_brand_color) || "#2a9b65",
    sourceUpdatedAt: text(canonical.updated_at) ||
      text(organisation.updated_at),
  };
}
function mandateLabel(value: unknown) {
  const mandateType = text(value).toLowerCase();
  return mandateType === "dual"
    ? "Dual mandate"
    : mandateType === "tri"
    ? "Tri mandate"
    : mandateType === "open"
    ? "Open mandate"
    : "Sole mandate";
}
function signedPackDocumentHtml(
  documentKey: string,
  session: RecordValue,
  signedName: string,
  signature: string,
) {
  const pack = snapshot(session.signing_pack_snapshot);
  const mandate = snapshot(pack.mandate);
  const seller = snapshot(pack.seller);
  const disclosureResponses = snapshot(snapshot(pack.disclosure).responses);
  const mandateType = text(mandate.mandateType).toLowerCase() || "sole";
  const mandateTitle = mandateLabel(mandateType);
  const title = documentKey === "disclosure"
    ? "Property condition disclosure"
    : documentKey === "fica"
    ? "Seller FICA declaration"
    : mandateTitle;
  const property = text(mandate.propertyAddress) ||
    text(snapshot(pack.property).address);
  const detail = documentKey === "mandate"
    ? `Asking price: ${escapeHtml(mandate.askingPrice)}<br>Commission: ${
      escapeHtml(
        mandate.commissionBasis === "fixed"
          ? mandate.commissionAmount
          : `${text(mandate.commissionPercentage)}%`,
      )
    } ${escapeHtml(mandate.vatHandling)}`
    : documentKey === "fica"
    ? `Seller/entity: ${escapeHtml(seller.name)}<br>Legal type: ${
      escapeHtml(seller.legalType)
    }<br>${
      ["company", "close_corporation", "foreign_company"].includes(
          text(seller.legalType).toLowerCase(),
        )
        ? `Company: ${
          escapeHtml(seller.companyName)
        }<br>Company registration number: ${
          escapeHtml(seller.companyRegistrationNumber)
        }<br>Registered address: ${escapeHtml(seller.companyRegisteredAddress)}`
        : ["trust", "foreign_trust"].includes(
            text(seller.legalType).toLowerCase(),
          )
        ? `Trust: ${
          escapeHtml(seller.trustName)
        }<br>Trust registration number: ${
          escapeHtml(seller.trustRegistrationNumber)
        }<br>Registered address: ${escapeHtml(seller.trustRegisteredAddress)}`
        : `First name: ${escapeHtml(seller.firstName)}<br>Surname: ${
          escapeHtml(seller.surname)
        }<br>ID / passport: ${escapeHtml(seller.idNumber)}<br>Date of birth: ${
          escapeHtml(seller.dateOfBirth)
        }<br>Nationality: ${
          escapeHtml(seller.nationality)
        }<br>Country of residence: ${
          escapeHtml(seller.countryOfResidence)
        }<br>Residential address: ${
          escapeHtml(seller.residentialAddress)
        }<br>Income tax number: ${
          escapeHtml(seller.incomeTaxNumber)
        }<br>Email: ${escapeHtml(seller.email)}<br>Phone: ${
          escapeHtml(seller.phone)
        }`
    }`
    : Object.entries(disclosureResponses).map(([key, value]) =>
      `${escapeHtml(key.replaceAll("_", " "))}: ${
        escapeHtml(snapshot(value).answer)
      }`
    ).join("<br>") ||
      "The seller reviewed the property-condition disclosure included in this signing pack.";
  const signatureMarkup = /^data:image\/(png|jpeg);base64,/i.test(signature)
    ? `<img src="${escapeHtml(signature)}" alt="Signature of ${
      escapeHtml(signedName)
    }" style="display:block;max-width:280px;max-height:120px;border-bottom:1px solid #172334">`
    : escapeHtml(signature);
  return `<article><h1>${escapeHtml(title)}</h1><p>Property: ${
    escapeHtml(property)
  }</p><p>${detail}</p><p>Frozen signing pack: ${
    escapeHtml(session.signing_pack_digest)
  }</p><p>Accepted and signed by ${
    escapeHtml(signedName)
  }.</p><p>Signature:</p>${signatureMarkup}</article>`;
}
async function sha256Bytes(value: Uint8Array) {
  const bytes = Uint8Array.from(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer)),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function fetchSigningBrandLogo(branding: RecordValue) {
  const candidates = [
    { variant: "light", url: text(branding.logoLightUrl) },
    { variant: "dark", url: text(branding.logoDarkUrl) },
    { variant: "icon", url: text(branding.logoIconUrl) },
  ].filter((candidate, index, values) =>
    candidate.url &&
    values.findIndex((value) => value.url === candidate.url) === index
  );
  for (const candidate of candidates) {
    if (!/^https:\/\//i.test(candidate.url)) continue;
    try {
      const logoResponse = await fetch(candidate.url, {
        signal: AbortSignal.timeout(8_000),
      });
      const mediaType = text(logoResponse.headers.get("content-type")).split(
        ";",
      )[0].toLowerCase();
      const declaredLength = Number(
        logoResponse.headers.get("content-length") || 0,
      );
      if (
        !logoResponse.ok ||
        !["image/png", "image/jpeg", "image/jpg"].includes(mediaType) ||
        declaredLength > 2_000_000
      ) continue;
      const bytes = new Uint8Array(await logoResponse.arrayBuffer());
      if (!bytes.length || bytes.length > 2_000_000) continue;
      return {
        bytes,
        mediaType: mediaType === "image/jpg" ? "image/jpeg" : mediaType,
        sourceUrl: candidate.url,
        variant: candidate.variant,
      };
    } catch {
      // Agency name and brand colours remain the deterministic fallback.
    }
  }
  return null;
}
async function persistImmutableBrandLogo(
  admin: any,
  input: {
    bytes: Uint8Array;
    mediaType: string;
    sourceUrl: string;
    variant: string;
  },
  listingId: string,
  lineageId: string,
) {
  const sha256 = await sha256Bytes(input.bytes);
  const extension = input.mediaType === "image/png" ? "png" : "jpg";
  const storagePath =
    `seller-signing/${listingId}/${lineageId}/branding/${input.variant}-${sha256}.${extension}`;
  const { error: uploadError } = await admin.storage.from(signedPdfBucket)
    .upload(storagePath, input.bytes, {
      contentType: input.mediaType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    const { data: existing, error: downloadError } = await admin.storage.from(
      signedPdfBucket,
    ).download(storagePath);
    if (downloadError || !existing) {
      throw new Error("The frozen agency logo could not be stored.");
    }
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (await sha256Bytes(existingBytes) !== sha256) {
      throw new Error(
        "The frozen agency logo does not match its branding lineage.",
      );
    }
  }
  return {
    bucket: signedPdfBucket,
    storagePath,
    mediaType: input.mediaType,
    byteLength: input.bytes.length,
    sha256,
    variant: input.variant,
    sourceUrl: input.sourceUrl,
  };
}
async function createSigningBrandingSnapshot(admin: any, input: {
  organisationId: string;
  privateListingId: string;
  lineageId: string;
  frozenAt: string;
}) {
  const canonical = await fetchCanonicalSigningBranding(
    admin,
    input.organisationId,
  );
  if (!canonical.organisationName) {
    throw new Error(
      "Configure the agency name before issuing seller documents.",
    );
  }
  const fetchedLogo = await fetchSigningBrandLogo(canonical);
  if (
    (canonical.logoLightUrl || canonical.logoDarkUrl ||
      canonical.logoIconUrl) &&
    !fetchedLogo
  ) {
    throw new Error(
      "The configured agency logo could not be frozen. Upload an accessible PNG or JPEG logo before issuing seller documents.",
    );
  }
  const logo = fetchedLogo
    ? await persistImmutableBrandLogo(
      admin,
      fetchedLogo,
      input.privateListingId,
      input.lineageId,
    )
    : null;
  const unsignedSnapshot = {
    contract: brandingSnapshotContract,
    organisationId: input.organisationId,
    organisationName: canonical.organisationName,
    website: canonical.website || null,
    primaryColour: canonical.primaryColour,
    secondaryColour: canonical.secondaryColour,
    accentColour: canonical.accentColour,
    frozenAt: input.frozenAt,
    source: {
      kind: "organisation_branding",
      updatedAt: canonical.sourceUpdatedAt || null,
      website: canonical.website || null,
      logoLightUrl: canonical.logoLightUrl || null,
      logoDarkUrl: canonical.logoDarkUrl || null,
      logoIconUrl: canonical.logoIconUrl || null,
    },
    logo,
  };
  return {
    ...unsignedSnapshot,
    digest: await hash(JSON.stringify(unsignedSnapshot)),
  };
}

async function createLegacySigningBrandingSnapshot(admin: any, input: {
  organisationId: string;
  privateListingId: string;
  lineageId: string;
  frozenAt: string;
  packBranding: RecordValue;
  signingPackDigest: string;
}) {
  const legacy = snapshot(input.packBranding);
  if (!isRecoverableLegacyPackBranding(legacy)) {
    throw new Error(
      "The frozen signing pack does not contain enough branding to recover this signed record.",
    );
  }
  const frozenBranding = {
    organisationName: text(legacy.organisationName),
    website: text(legacy.website || legacy.websiteUrl),
    logoLightUrl: text(legacy.logoLightUrl),
    logoDarkUrl: text(legacy.logoDarkUrl),
    logoIconUrl: text(legacy.logoIconUrl),
    primaryColour: text(legacy.primaryColour) || "#173f5f",
    secondaryColour: text(legacy.secondaryColour) || "#102a43",
    accentColour: text(legacy.accentColour) || "#2a9b65",
  };
  const fetchedLogo = await fetchSigningBrandLogo(frozenBranding);
  if (
    (frozenBranding.logoLightUrl || frozenBranding.logoDarkUrl ||
      frozenBranding.logoIconUrl) && !fetchedLogo
  ) {
    throw new Error(
      "The logo frozen into this signed pack is no longer accessible. The record was not changed.",
    );
  }
  const logo = fetchedLogo
    ? await persistImmutableBrandLogo(
      admin,
      fetchedLogo,
      input.privateListingId,
      input.lineageId,
    )
    : null;
  const unsignedSnapshot = {
    contract: brandingSnapshotContract,
    organisationId: input.organisationId,
    organisationName: frozenBranding.organisationName,
    website: frozenBranding.website || null,
    primaryColour: frozenBranding.primaryColour,
    secondaryColour: frozenBranding.secondaryColour,
    accentColour: frozenBranding.accentColour,
    frozenAt: input.frozenAt,
    source: {
      kind: "legacy_signing_pack_branding_recovery",
      signingPackDigest: input.signingPackDigest,
      website: frozenBranding.website || null,
      logoLightUrl: frozenBranding.logoLightUrl || null,
      logoDarkUrl: frozenBranding.logoDarkUrl || null,
      logoIconUrl: frozenBranding.logoIconUrl || null,
    },
    logo,
  };
  return {
    ...unsignedSnapshot,
    digest: await hash(JSON.stringify(unsignedSnapshot)),
  };
}
async function ensureSigningBrandingSnapshot(
  admin: any,
  session: RecordValue,
  pack: RecordValue,
) {
  const storedBranding = snapshot(session.branding_snapshot);
  const packBranding = snapshot(pack.branding);
  if (isAuthoritativeBrandingSnapshot(storedBranding)) {
    if (
      text(session.branding_digest) &&
      text(session.branding_digest) !== text(storedBranding.digest)
    ) {
      throw new Error(
        "The stored agency branding digest does not match its snapshot.",
      );
    }
    if (
      isAuthoritativeBrandingSnapshot(packBranding) &&
      text(packBranding.digest) !== text(storedBranding.digest)
    ) {
      throw new Error(
        "The signing pack agency branding does not match its session lineage.",
      );
    }
    return storedBranding;
  }
  if (isAuthoritativeBrandingSnapshot(packBranding)) {
    return packBranding;
  }
  const frozenAt = text(session.signing_pack_frozen_at) ||
    text(pack.frozenAt) || text(session.created_at) || new Date().toISOString();
  const signedLegacyPackCanBeRecovered = text(session.status) === "signed" &&
    /^[0-9a-f]{64}$/i.test(text(session.signing_pack_digest)) &&
    !text(session.branding_digest) &&
    isRecoverableLegacyPackBranding(packBranding);
  const branding = signedLegacyPackCanBeRecovered
    ? await createLegacySigningBrandingSnapshot(admin, {
      organisationId: text(session.organisation_id),
      privateListingId: text(session.private_listing_id),
      lineageId: text(session.signing_group_id) || text(session.id),
      frozenAt,
      packBranding,
      signingPackDigest: text(session.signing_pack_digest),
    })
    : await createSigningBrandingSnapshot(admin, {
      organisationId: text(session.organisation_id),
      privateListingId: text(session.private_listing_id),
      lineageId: text(session.signing_group_id) || text(session.id),
      frozenAt,
    });
  const { error } = await admin.from("private_listing_mandate_signing_sessions")
    .update({
      branding_snapshot: branding,
      branding_digest: branding.digest,
      branding_frozen_at: frozenAt,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id).is("branding_digest", null);
  if (error) {
    throw new Error(
      "The agency branding lineage could not be attached to this signing session.",
    );
  }
  return branding;
}
async function signingBrandingForRecipient(admin: any, brandingValue: unknown) {
  const branding = snapshot(brandingValue);
  const logo = snapshot(branding.logo);
  let logoUrl = "";
  if (text(logo.bucket) && text(logo.storagePath)) {
    const { data, error } = await admin.storage.from(text(logo.bucket))
      .createSignedUrl(text(logo.storagePath), 10 * 60);
    if (!error) logoUrl = text(data?.signedUrl);
  }
  return {
    ...branding,
    logoLightUrl: logoUrl,
    logoDarkUrl: logoUrl,
    logoIconUrl: logoUrl,
  };
}
async function loadFrozenSigningBrandLogo(admin: any, brandingValue: unknown) {
  const logo = snapshot(snapshot(brandingValue).logo);
  if (!text(logo.bucket) || !text(logo.storagePath)) return null;
  const { data, error } = await admin.storage.from(text(logo.bucket)).download(
    text(logo.storagePath),
  );
  if (error || !data) {
    throw new Error("The frozen agency logo could not be loaded.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!bytes.length || await sha256Bytes(bytes) !== text(logo.sha256)) {
    throw new Error("The frozen agency logo failed its lineage check.");
  }
  return { bytes, mediaType: text(logo.mediaType) };
}
async function uploadImmutableSignedPdf(
  admin: any,
  storagePath: string,
  bytes: Uint8Array,
) {
  const { error: uploadError } = await admin.storage.from(signedPdfBucket)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });
  if (!uploadError) return bytes;
  // A previous request may have uploaded the deterministic object and then
  // lost its response before the database row was attached. Reuse only a
  // valid PDF at that exact path; never overwrite a committed legal artifact.
  const { data: existing, error: downloadError } = await admin.storage.from(
    signedPdfBucket,
  ).download(storagePath);
  if (downloadError || !existing) {
    throw new Error("The signed PDF could not be stored.");
  }
  const existingBytes = new Uint8Array(await existing.arrayBuffer());
  if (
    existingBytes.length < 100 ||
    String.fromCharCode(...existingBytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new Error("The existing signed PDF artifact is invalid.");
  }
  if (await sha256Bytes(existingBytes) !== await sha256Bytes(bytes)) {
    throw new Error(
      "The existing signed PDF does not match the frozen signing record. It was not replaced.",
    );
  }
  return existingBytes;
}
async function finaliseServerRenderedSignedPdfs(
  admin: any,
  session: RecordValue,
  selectedDocuments: string[],
  pack: RecordValue,
  signedName: string,
  signature: string,
  signedAt: string,
) {
  const branding = await ensureSigningBrandingSnapshot(admin, session, pack);
  const logo = await loadFrozenSigningBrandLogo(admin, branding);
  const artifacts: RecordValue = {};
  for (const documentKey of orderDocuments(selectedDocuments)) {
    const rendered = await renderSellerSignedPdf({
      documentKey,
      signingPack: { ...pack, branding },
      signingPackDigest: text(session.signing_pack_digest),
      signedName,
      signature,
      signedAt,
      branding,
      logo,
    });
    const storagePath = `seller-signing/${text(session.private_listing_id)}/${
      text(session.id)
    }/signed-${documentKey}.pdf`;
    const persistedBytes = await uploadImmutableSignedPdf(
      admin,
      storagePath,
      rendered.bytes,
    );
    artifacts[documentKey] = {
      storagePath,
      fileName: rendered.fileName,
      mediaType: rendered.mediaType,
      byteLength: persistedBytes.length,
      sha256: await sha256Bytes(persistedBytes),
    };
  }
  const { data: attached, error: attachError } = await admin.rpc(
    "bridge_attach_listing_seller_signed_pdf_artifacts",
    {
      p_session_id: session.id,
      p_artifacts: artifacts,
    },
  );
  if (attachError || !attached) {
    throw new Error(
      attachError?.message ||
        "The signed PDFs could not be attached to the listing.",
    );
  }
  return snapshot(snapshot(attached).artifacts);
}
async function issueSellerPortalRecipientInvites(
  admin: any,
  url: string,
  serviceKey: string,
  sessionId: string,
  organisationId: string,
  propertyTitle: string,
  agentName: string,
) {
  const { data: recipientRows, error } = await admin.rpc(
    "bridge_list_completed_listing_seller_portal_recipients",
    { p_signing_session_id: sessionId },
  );
  const recipients = Array.isArray(recipientRows)
    ? recipientRows as RecordValue[]
    : [];
  if (error || !recipients.length) {
    return {
      attempted: false,
      deliveries: [],
      error: error?.message ||
        "Seller portal recipients could not be prepared.",
    };
  }
  const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(
    /\/$/,
    "",
  );
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const deliveries = [] as Array<RecordValue>;
  for (const recipient of recipients) {
    const rawToken = `seller-recipient-${token()}`;
    const { data: inviteData, error: inviteError } = await admin.rpc(
      "bridge_prepare_listing_seller_portal_recipient_invite",
      {
        p_signing_session_id: recipient.signing_session_id,
        p_invite_token_hash: await hash(rawToken),
        p_expires_at: expiresAt,
      },
    );
    const invite = snapshot(inviteData);
    if (inviteError || !invite?.inviteId || invite?.alreadyPrepared) {
      deliveries.push({
        recipientEmail: recipient.signer_email,
        delivery: invite?.alreadyPrepared ? "already_sent" : "failed",
      });
      continue;
    }
    const mail = await fetch(
      `${url.replace(/\/$/, "")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          type: "seller_portal_link",
          to: recipient.signer_email,
          organisationId,
          recipientRole: "seller",
          recipientName: recipient.signer_name,
          sellerName: recipient.signer_name,
          propertyTitle,
          portalLink: `${appUrl}/client/${rawToken}/selling`,
          onboardingLink: `${appUrl}/client/${rawToken}/selling`,
          agentName,
        }),
      },
    );
    await admin.rpc(
      "bridge_record_listing_seller_portal_recipient_invite_delivery",
      {
        p_invite_id: invite.inviteId,
        p_sent: mail.ok,
        p_error: mail.ok ? null : "Seller portal email delivery failed.",
      },
    );
    deliveries.push({
      recipientEmail: recipient.signer_email,
      delivery: mail.ok ? "sent" : "failed",
      expiresAt,
    });
  }
  return { attempted: true, deliveries };
}
async function authorizeListingRequest(
  req: Request,
  url: string,
  anonKey: string,
  listingId: string,
) {
  const authorization = req.headers.get("Authorization") || "";
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return {
      error: response(401, {
        success: false,
        error: "Sign in to manage seller document links.",
      }),
    };
  }
  const { data: listing, error: listingError } = await caller.from(
    "private_listings",
  ).select("id, organisation_id").eq("id", listingId).maybeSingle();
  if (listingError || !listing) {
    return {
      error: response(403, {
        success: false,
        error: "You do not have access to this listing.",
      }),
    };
  }
  return { caller, listing, user: userData.user };
}

async function isOrganisationAdmin(caller: any, organisationId: string) {
  const { data, error } = await caller.rpc("bridge_is_org_admin", {
    target_org: organisationId,
  });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return response(405, { success: false, error: "Method not allowed." });
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !serviceKey || !anonKey) {
    return response(500, {
      success: false,
      error: "Signing service is not configured.",
    });
  }
  const body = await req.json().catch(() => ({})) as RecordValue;
  const action = text(body.action).toLowerCase();
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  if (action === "issue") {
    const listingId = text(body.listingId);
    const authorizationResult = await authorizeListingRequest(
      req,
      url,
      anonKey,
      listingId,
    );
    if (authorizationResult.error) return authorizationResult.error;
    const { listing, user } = authorizationResult;
    const requestedSigners = Array.isArray(body.signers) && body.signers.length
      ? body.signers.map((item) => snapshot(item))
      : [{ name: body.signerName, email: body.signerEmail, role: "Seller" }];
    const signers = requestedSigners.map((signer) => ({
      name: text(signer.name),
      email: email(signer.email),
      role: text(signer.role) || "Seller",
    }));
    if (
      !signers.length ||
      signers.some((signer) => !signer.name || !validEmail(signer.email))
    ) {
      return response(400, {
        success: false,
        error: "Every required signer needs a name and valid email.",
      });
    }
    if (
      new Set(signers.map((signer) => signer.email)).size !== signers.length
    ) {
      return response(400, {
        success: false,
        error: "Each required signer must have a different email address.",
      });
    }
    const primaryDocumentContactEmail =
      email(body.primaryDocumentContactEmail) || signers[0]?.email;
    if (
      !signers.some((signer) => signer.email === primaryDocumentContactEmail)
    ) {
      return response(400, {
        success: false,
        error:
          "Choose one of the required signers as the primary document contact.",
      });
    }
    const selectedDocuments = orderDocuments(body.selectedDocuments);
    if (!selectedDocuments.length) {
      return response(400, {
        success: false,
        error: "Choose at least one seller document.",
      });
    }
    const supersededSigningGroupId = text(body.supersededSigningGroupId);
    const replacementReason = text(body.replacementReason);
    const correctionRequestActivityId = text(body.correctionRequestActivityId);
    if (supersededSigningGroupId && replacementReason.length < 5) {
      return response(400, {
        success: false,
        error: "Provide a short reason for replacing this seller signing pack.",
      });
    }
    if (correctionRequestActivityId && !supersededSigningGroupId) {
      return response(400, {
        success: false,
        error:
          "A correction request must be linked to the signing pack it replaces.",
      });
    }
    const now = new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString();
    const mandateSnapshot = snapshot(body.mandateSnapshot);
    const signingGroupId = crypto.randomUUID();
    let brandingSnapshot: RecordValue;
    try {
      brandingSnapshot = await createSigningBrandingSnapshot(admin, {
        organisationId: text(listing.organisation_id),
        privateListingId: text(listing.id),
        lineageId: signingGroupId,
        frozenAt: issuedAt,
      });
    } catch (brandingError) {
      return response(409, {
        success: false,
        error: brandingError instanceof Error
          ? brandingError.message
          : "The agency branding could not be frozen for this signing pack.",
      });
    }
    const basePackSnapshot = signingPack(
      body.signingPack,
      selectedDocuments,
      mandateSnapshot,
      issuedAt,
    );
    const packSnapshot = {
      ...basePackSnapshot,
      branding: brandingSnapshot,
      mandate: {
        ...snapshot(basePackSnapshot.mandate),
        branding: brandingSnapshot,
      },
      primaryDocumentContact: {
        email: primaryDocumentContactEmail,
        name: signers.find((signer) =>
          signer.email === primaryDocumentContactEmail
        )?.name || "",
      },
    };
    const packDigest = await hash(JSON.stringify(packSnapshot));
    const appUrl = (Deno.env.get("APP_URL") || "https://app.arch9.co.za")
      .replace(/\/$/, "");
    const agentName = text(body.agentName) || "Your agent";
    const preparedSigners = await Promise.all(signers.map(async (signer) => {
      const rawToken = token();
      return { ...signer, rawToken, tokenHash: await hash(rawToken) };
    }));
    const { data: preparedPackData, error: prepareError } = await admin.rpc(
      "bridge_prepare_listing_seller_signing_pack_atomically",
      {
        p_listing_id: listing.id,
        p_signing_group_id: signingGroupId,
        p_sessions: preparedSigners.map((signer) => ({
          signerName: signer.name,
          signerEmail: signer.email,
          tokenHash: signer.tokenHash,
          expiresAt,
          selectedDocuments,
          mandateSnapshot,
          signingPackSnapshot: packSnapshot,
          signingPackVersion: text(packSnapshot.version) || signingPackVersion,
          signingPackDigest: packDigest,
          signingPackFrozenAt: issuedAt,
          isPrimaryDocumentContact:
            signer.email === primaryDocumentContactEmail,
          primaryDocumentContactEmail,
          brandingSnapshot,
          brandingDigest: brandingSnapshot.digest,
          brandingFrozenAt: issuedAt,
        })),
        p_superseded_signing_group_id: supersededSigningGroupId || null,
        p_replacement_reason: supersededSigningGroupId
          ? replacementReason
          : null,
        p_initiated_by: user.id,
      },
    );
    if (prepareError) {
      return response(409, {
        success: false,
        error: prepareError.message ||
          "This seller signing pack cannot be prepared.",
      });
    }
    const preparedPack = snapshot(preparedPackData);
    const isAmendment = preparedPack.isAmendment === true;
    let correctionResolutionRecorded = false;
    if (correctionRequestActivityId) {
      const { data: correctionResolution, error: correctionResolutionError } =
        await admin.rpc(
          "bridge_record_listing_seller_signing_correction_resolution",
          {
            p_listing_id: listing.id,
            p_request_activity_id: correctionRequestActivityId,
            p_replacement_signing_group_id: signingGroupId,
            p_initiated_by: user.id,
          },
        );
      if (correctionResolutionError) {
        console.error(
          "seller signing correction resolution audit failed",
          correctionResolutionError.message,
        );
      } else {correctionResolutionRecorded =
          snapshot(correctionResolution).created === true;}
    }

    // Email is intentionally post-transaction: an outage must leave valid,
    // copyable signing links instead of a half-recorded correction.
    const issued = [] as Array<
      {
        signerName: string;
        signerEmail: string;
        signingLink: string;
        expiresAt: string;
        delivery: string;
      }
    >;
    for (const signer of preparedSigners) {
      const signingLink = `${appUrl}/mandate-sign/${signer.rawToken}`;
      const mail = await fetch(
        `${url.replace(/\/$/, "")}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            type: "seller_mandate_sent",
            to: signer.email,
            organisationId: listing.organisation_id,
            recipientRole: "seller",
            recipientName: signer.name,
            sellerName: signer.name,
            propertyTitle:
              text(snapshot(body.mandateSnapshot).propertyAddress) ||
              "your property",
            mandateType: selectedDocuments.length > 1
              ? "Seller documents"
              : selectedDocuments[0] === "fica"
              ? "FICA declaration"
              : selectedDocuments[0] === "disclosure"
              ? "Property disclosure"
              : mandateLabel(mandateSnapshot.mandateType),
            askingPrice: text(snapshot(body.mandateSnapshot).askingPrice),
            portalLink: signingLink,
            agentName,
          }),
        },
      );
      issued.push({
        signerName: signer.name,
        signerEmail: signer.email,
        signingLink,
        expiresAt,
        delivery: mail.ok ? "sent" : "failed",
      });
    }
    const delivery = issued.every((item) => item.delivery === "sent")
      ? "sent"
      : issued.some((item) => item.delivery === "sent")
      ? "partial"
      : "failed";
    if (delivery !== "failed" && selectedDocuments.includes("mandate")) {
      await admin.from("private_listings").update({
        mandate_status: "sent_to_seller",
        listing_status: "mandate_sent",
      }).eq("id", listing.id);
    }
    return response(200, {
      success: true,
      delivery,
      signingGroupId,
      signingLink: issued[0]?.signingLink || "",
      signingLinks: issued,
      expiresAt,
      correctedSigningGroupId: supersededSigningGroupId || null,
      isAmendment,
      signedSessionsRetained: Number(preparedPack.signedSessionsRetained || 0),
      correctionResolutionRecorded,
      brandingDigest: brandingSnapshot.digest,
    });
  }

  if (action === "repair-existing") {
    const listingId = text(body.listingId);
    const sessionId = text(body.sessionId);
    const authorizationResult = await authorizeListingRequest(
      req,
      url,
      anonKey,
      listingId,
    );
    if (authorizationResult.error) return authorizationResult.error;
    const { caller, listing, user } = authorizationResult;
    if (!await isOrganisationAdmin(caller, text(listing.organisation_id))) {
      return response(403, {
        success: false,
        error: "Only an organisation administrator can repair signed records.",
      });
    }
    if (!sessionId) {
      return response(400, {
        success: false,
        error: "Choose the signed seller session to inspect.",
      });
    }
    const { data: session, error: sessionError } = await admin.from(
      "private_listing_mandate_signing_sessions",
    ).select("*").eq("id", sessionId).eq("private_listing_id", listing.id)
      .maybeSingle();
    if (sessionError || !session) {
      return response(404, {
        success: false,
        error: "The signed seller session was not found on this listing.",
      });
    }
    const { data: planData, error: planError } = await admin.rpc(
      "bridge_plan_listing_seller_document_repair",
      { p_session_id: session.id },
    );
    const repairPlan = snapshot(planData);
    if (planError || !text(repairPlan.planDigest)) {
      return response(500, {
        success: false,
        error: planError?.message || "The signed record could not be audited.",
      });
    }

    // A repair is always dry-run first. The apply request must echo the exact
    // plan digest so a concurrent record change cannot be repaired by mistake.
    if (body.apply !== true) {
      return response(200, {
        success: true,
        dryRun: true,
        plan: repairPlan,
      });
    }
    if (repairPlan.automaticRepairAllowed !== true) {
      return response(409, {
        success: false,
        dryRun: false,
        manualReviewRequired: true,
        plan: repairPlan,
        error:
          "This signed record is ambiguous and was not changed. Review the repair reasons before proceeding.",
      });
    }
    const expectedPlanDigest = text(body.expectedPlanDigest).toLowerCase();
    const reason = text(body.reason);
    if (expectedPlanDigest !== text(repairPlan.planDigest).toLowerCase()) {
      return response(409, {
        success: false,
        error: "The repair plan changed. Run the dry-run again.",
        plan: repairPlan,
      });
    }
    if (reason.length < 10) {
      return response(400, {
        success: false,
        error: "Provide an audit reason of at least 10 characters.",
      });
    }

    let repairRunId = "";
    try {
      const { data: startedData, error: startError } = await admin.rpc(
        "bridge_start_listing_seller_document_repair",
        {
          p_session_id: session.id,
          p_expected_plan_digest: expectedPlanDigest,
          p_reason: reason,
          p_requested_by: user.id,
        },
      );
      const started = snapshot(startedData);
      repairRunId = text(started.repairRunId);
      if (startError || !repairRunId) {
        throw new Error(
          startError?.message || "The signed record repair could not start.",
        );
      }
      const { error: prepareError } = await admin.rpc(
        "bridge_prepare_listing_seller_document_repair_rows",
        { p_repair_run_id: repairRunId },
      );
      if (prepareError) throw new Error(prepareError.message);

      const { data: refreshedSession, error: refreshError } = await admin.from(
        "private_listing_mandate_signing_sessions",
      ).select("*").eq("id", session.id).single();
      if (refreshError || !refreshedSession) {
        throw new Error(
          "The signed record changed while it was being repaired.",
        );
      }
      const refreshedPack = snapshot(refreshedSession.signing_pack_snapshot);
      const artifacts = await finaliseServerRenderedSignedPdfs(
        admin,
        refreshedSession,
        orderDocuments(refreshedSession.selected_documents),
        refreshedPack,
        text(refreshedSession.signed_name),
        text(refreshedSession.signature),
        text(refreshedSession.signed_at),
      );
      const repairResult = {
        contract: "arch9-seller-document-repair-result-v1",
        planDigest: expectedPlanDigest,
        artifacts,
        repairedAt: new Date().toISOString(),
      };
      const { data: completedData, error: completeError } = await admin.rpc(
        "bridge_finish_listing_seller_document_repair",
        {
          p_repair_run_id: repairRunId,
          p_status: "completed",
          p_result: repairResult,
          p_error_message: null,
        },
      );
      if (completeError) throw new Error(completeError.message);
      return response(200, {
        success: true,
        dryRun: false,
        repair: snapshot(completedData),
        artifacts,
      });
    } catch (repairError) {
      const message = repairError instanceof Error
        ? repairError.message
        : "The signed record repair failed safely.";
      if (repairRunId) {
        await admin.rpc("bridge_finish_listing_seller_document_repair", {
          p_repair_run_id: repairRunId,
          p_status: "failed",
          p_result: {},
          p_error_message: message,
        });
      }
      return response(409, {
        success: false,
        dryRun: false,
        repairRunId: repairRunId || null,
        signedEvidencePreserved: true,
        error: message,
      });
    }
  }

  if (action === "status" || action === "revoke" || action === "resend") {
    const listingId = text(body.listingId);
    const authorizationResult = await authorizeListingRequest(
      req,
      url,
      anonKey,
      listingId,
    );
    if (authorizationResult.error) return authorizationResult.error;
    const { listing, user } = authorizationResult;
    if (action === "status") {
      const { data: sessions, error } = await admin.from(
        "private_listing_mandate_signing_sessions",
      )
        .select(
          "id, status, signer_email, signer_name, selected_documents, document_progress, signing_acknowledgements, signing_group_id, is_primary_document_contact, primary_document_contact_email, signing_pack_version, signing_pack_digest, signing_pack_frozen_at, signing_pack_snapshot, branding_digest, branding_frozen_at, expires_at, viewed_at, signed_at, created_at",
        )
        .eq("private_listing_id", listing.id).order("created_at", {
          ascending: false,
        }).limit(10);
      if (error) {
        return response(500, {
          success: false,
          error: "Unable to load seller document link status.",
        });
      }
      const now = Date.now();
      const normalizedSessions = (sessions || []).map(
        (session: RecordValue) => {
          const { signing_pack_snapshot: packSnapshot, ...safeSession } =
            session;
          return {
            ...safeSession,
            status: text(session.status) === "active" &&
                new Date(text(session.expires_at)).getTime() <= now
              ? "expired"
              : session.status,
            signingPackSummary: signingPackStatusSummary(packSnapshot),
          };
        },
      );
      const sessionIds = normalizedSessions.map((session: RecordValue) =>
        text(session.id)
      ).filter(Boolean);
      const [
        { data: invitations },
        { data: taskPlan },
        { data: replacements, error: replacementsError },
        { data: correctionActivities, error: correctionsError },
      ] = await Promise.all([
        sessionIds.length
          ? admin.from("private_listing_seller_portal_recipient_invites")
            .select(
              "signing_session_id, recipient_name, recipient_email, status, sent_at, expires_at, opened_at, consumed_at",
            ).in("signing_session_id", sessionIds)
          : Promise.resolve({ data: [] }),
        admin.from("private_listing_seller_portal_task_plans").select(
          "task_plan, updated_at",
        ).eq("private_listing_id", listing.id).maybeSingle(),
        admin.from("private_listing_signing_pack_replacements").select(
          "id, superseded_signing_group_id, replacement_signing_group_id, reason, initiated_by, created_at",
        ).eq("private_listing_id", listing.id).order("created_at", {
          ascending: false,
        }).limit(20),
        admin.from("private_listing_activity").select(
          "id, activity_type, activity_title, activity_description, metadata, created_at",
        ).eq("private_listing_id", listing.id).in("activity_type", [
          "seller_signing_pack_post_signature_correction_requested",
          "seller_signing_pack_correction_actioned",
        ]).order("created_at", { ascending: false }).limit(50),
      ]);
      if (replacementsError || correctionsError) {
        return response(500, {
          success: false,
          error: "Unable to load seller signing correction history.",
        });
      }
      return response(200, {
        success: true,
        sessions: normalizedSessions,
        portalInvitations: invitations || [],
        portalTaskPlan: snapshot(taskPlan),
        replacements: replacements || [],
        correctionActivities: correctionActivities || [],
      });
    }
    const sessionId = text(body.sessionId);
    if (!sessionId) {
      return response(400, {
        success: false,
        error: "Choose the document link to revoke.",
      });
    }
    const { data: session, error: sessionError } = await admin.from(
      "private_listing_mandate_signing_sessions",
    )
      .select(
        "id, status, signer_name, signer_email, selected_documents, mandate_snapshot",
      ).eq("id", sessionId).eq("private_listing_id", listing.id).maybeSingle();
    if (sessionError || !session) {
      return response(404, {
        success: false,
        error: "That document link was not found.",
      });
    }
    if (session.status !== "active") {
      return response(409, {
        success: false,
        error: `Only an active document link can be ${
          action === "resend" ? "reissued" : "revoked"
        }.`,
      });
    }
    if (action === "resend") {
      // Tokens are intentionally never persisted in plaintext. A delivery retry
      // rotates the opaque token and invalidates the previous URL in one bridge.
      const rawToken = token();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString();
      const { error: rotateError } = await admin.rpc(
        "bridge_rotate_listing_seller_signing_link",
        {
          p_session_id: session.id,
          p_token_hash: await hash(rawToken),
          p_expires_at: expiresAt,
          p_initiated_by: user.id,
        },
      );
      if (rotateError) {
        return response(409, {
          success: false,
          error: rotateError.message ||
            "A fresh signing link could not be created.",
        });
      }
      const signingLink = `${
        (Deno.env.get("APP_URL") || "https://app.arch9.co.za").replace(
          /\/$/,
          "",
        )
      }/mandate-sign/${rawToken}`;
      const selectedDocuments = orderDocuments(session.selected_documents);
      const mandate = snapshot(session.mandate_snapshot);
      const agentName = text(body.agentName) || "Your agent";
      const mail = await fetch(
        `${url.replace(/\/$/, "")}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            type: "seller_mandate_sent",
            to: session.signer_email,
            organisationId: listing.organisation_id,
            recipientRole: "seller",
            recipientName: session.signer_name,
            sellerName: session.signer_name,
            propertyTitle: text(mandate.propertyAddress) || "your property",
            mandateType: selectedDocuments.length > 1
              ? "Seller documents"
              : selectedDocuments[0] === "fica"
              ? "FICA declaration"
              : selectedDocuments[0] === "disclosure"
              ? "Property disclosure"
              : mandateLabel(mandate.mandateType),
            askingPrice: text(mandate.askingPrice),
            portalLink: signingLink,
            agentName,
          }),
        },
      );
      return response(200, {
        success: true,
        delivery: mail.ok ? "sent" : "failed",
        signingLink,
        expiresAt,
        previousLinkInvalidated: true,
      });
    }
    const { error: revokeError } = await admin.from(
      "private_listing_mandate_signing_sessions",
    )
      .update({ status: "revoked", updated_at: new Date().toISOString() }).eq(
        "id",
        session.id,
      ).eq("status", "active");
    if (revokeError) {
      return response(500, {
        success: false,
        error: "Unable to revoke the document link.",
      });
    }
    return response(200, { success: true });
  }

  const rawToken = text(body.token);
  if (!rawToken) {
    return response(400, { success: false, error: "Signing link is missing." });
  }
  const { data: session, error: sessionError } = await admin.from(
    "private_listing_mandate_signing_sessions",
  ).select("*").eq("token_hash", await hash(rawToken)).maybeSingle();
  if (sessionError || !session) {
    return response(404, {
      success: false,
      error: "This signing link is invalid.",
    });
  }
  if (action === "request-correction") {
    const issue = text(body.issue);
    if (session.status !== "signed") {
      return response(409, {
        success: false,
        error:
          "A correction can be requested after this signer has completed the pack.",
      });
    }
    if (issue.length < 5) {
      return response(400, {
        success: false,
        error: "Describe the correction your agent needs to make.",
      });
    }
    await admin.from("private_listing_activity").insert({
      private_listing_id: session.private_listing_id,
      activity_type: "seller_signing_pack_post_signature_correction_requested",
      activity_title: "Seller requested a signed-pack correction",
      activity_description: `${
        text(session.signer_name) || "A signer"
      } requested a correction after signing: ${issue}`,
      visibility: "internal",
      metadata: {
        signingSessionId: session.id,
        signingGroupId: session.signing_group_id || null,
        signerEmail: email(session.signer_email),
        issue,
        signedAt: session.signed_at || null,
      },
    });
    return response(200, {
      success: true,
      message:
        "Your correction request has been sent to the agent. The signed record remains unchanged until they prepare a replacement.",
    });
  }
  if (action === "resolve" && session.status === "signed") {
    let serverRenderedArtifacts: RecordValue;
    try {
      serverRenderedArtifacts = await finaliseServerRenderedSignedPdfs(
        admin,
        session,
        orderDocuments(session.selected_documents),
        snapshot(session.signing_pack_snapshot),
        text(session.signed_name),
        text(session.signature),
        text(session.signed_at),
      );
    } catch (pdfError) {
      return response(500, {
        success: false,
        signatureSaved: true,
        error: pdfError instanceof Error
          ? pdfError.message
          : "The signed PDFs are still being finalised. Refresh to retry.",
      });
    }
    let groupComplete = true;
    if (text(session.signing_group_id)) {
      const { count, error: groupError } = await admin.from(
        "private_listing_mandate_signing_sessions",
      )
        .select("id", { count: "exact", head: true })
        .eq("signing_group_id", session.signing_group_id)
        .neq("status", "signed");
      if (groupError) {
        return response(500, {
          success: false,
          error: "The completed signing result could not be loaded.",
        });
      }
      groupComplete = Number(count || 0) === 0;
    }
    return response(200, {
      success: true,
      complete: true,
      groupComplete,
      signedAt: session.signed_at,
      progress: session.document_progress || {},
      serverRenderedArtifacts,
      idempotentReplay: true,
    });
  }
  const committedSigningReplay = session.status === "signed" &&
    (action === "sign-pack" || action === "sign");
  if (
    !committedSigningReplay &&
    (session.status !== "active" ||
      new Date(session.expires_at).getTime() <= Date.now())
  ) {
    if (session.status === "active") {
      await admin.from("private_listing_mandate_signing_sessions").update({
        status: "expired",
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
    }
    return response(410, {
      success: false,
      error: "This signing link has expired or has already been used.",
    });
  }
  if (action === "resolve") {
    await admin.from("private_listing_mandate_signing_sessions").update({
      viewed_at: session.viewed_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);
    let primaryDocumentContactSigned =
      session.is_primary_document_contact !== false;
    if (
      text(session.signing_group_id) &&
      session.is_primary_document_contact === false
    ) {
      const { data: primarySession } = await admin.from(
        "private_listing_mandate_signing_sessions",
      )
        .select("status").eq("signing_group_id", session.signing_group_id).eq(
          "is_primary_document_contact",
          true,
        ).maybeSingle();
      primaryDocumentContactSigned = primarySession?.status === "signed";
    }
    const frozenPack = snapshot(session.signing_pack_snapshot);
    let branding: RecordValue;
    try {
      branding = await ensureSigningBrandingSnapshot(
        admin,
        session,
        frozenPack,
      );
    } catch (brandingError) {
      return response(500, {
        success: false,
        error: brandingError instanceof Error
          ? brandingError.message
          : "The frozen agency branding could not be loaded.",
      });
    }
    const recipientBranding = await signingBrandingForRecipient(
      admin,
      branding,
    );
    const signingPackWithFrozenBranding = {
      ...frozenPack,
      branding: recipientBranding,
      mandate: { ...snapshot(frozenPack.mandate), branding: recipientBranding },
    };
    return response(200, {
      success: true,
      session: {
        signerName: session.signer_name,
        expiresAt: session.expires_at,
        selectedDocuments: session.selected_documents,
        progress: session.document_progress || {},
        mandate: session.mandate_snapshot,
        signingPack: signingPackWithFrozenBranding,
        signingPackVersion: text(session.signing_pack_version) ||
          signingPackVersion,
        signingPackDigest: text(session.signing_pack_digest),
        signingPackFrozenAt: session.signing_pack_frozen_at || null,
        isPrimaryDocumentContact: session.is_primary_document_contact !== false,
        primaryDocumentContactEmail:
          text(session.primary_document_contact_email) ||
          text(snapshot(frozenPack.primaryDocumentContact).email),
        primaryDocumentContactSigned,
        brandingDigest: text(branding.digest),
        brandingFrozenAt: text(branding.frozenAt),
      },
    });
  }
  if (action === "save-fica-details") {
    if (session.is_primary_document_contact === false) {
      return response(403, {
        success: false,
        error:
          "Only the primary document contact can change shared seller details. You can review the frozen pack and sign it, or ask the agent to prepare a replacement.",
      });
    }
    const fica = snapshot(snapshot(body.sellerResponses).fica);
    const missing = ficaDetailErrors(
      fica,
      snapshot(snapshot(session.signing_pack_snapshot).seller),
    );
    if (missing.length) {
      return response(400, {
        success: false,
        error: `Add ${missing.join(", ")} before continuing.`,
      });
    }
    try {
      const saved = await syncSigningSellerDetails(admin, session, fica);
      return response(200, {
        success: true,
        signingPack: saved.signingPack,
        signingPackDigest: saved.signingPackDigest,
        changedFields: saved.changedFields,
      });
    } catch (saveError) {
      return response(500, {
        success: false,
        error: saveError instanceof Error
          ? saveError.message
          : "Seller details could not be saved. Please try again.",
      });
    }
  }
  if (action === "flag-issue") {
    const issue = text(body.issue);
    if (issue.length < 5) {
      return response(400, {
        success: false,
        error: "Describe the issue so the agent can prepare a corrected pack.",
      });
    }
    const groupQuery = admin.from("private_listing_mandate_signing_sessions")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("status", "active");
    const { error: revokeError } = text(session.signing_group_id)
      ? await groupQuery.eq("signing_group_id", session.signing_group_id)
      : await groupQuery.eq("id", session.id);
    if (revokeError) {
      return response(500, {
        success: false,
        error: "The signing pack could not be paused for correction.",
      });
    }
    await admin.from("private_listing_activity").insert({
      private_listing_id: session.private_listing_id,
      activity_type: "seller_signing_pack_issue_flagged",
      activity_title: "Seller signing pack needs correction",
      activity_description: `${
        text(session.signer_name) || "A signer"
      } flagged an issue: ${issue}`,
      visibility: "internal",
      metadata: {
        signingSessionId: session.id,
        signingGroupId: session.signing_group_id || null,
        signerEmail: email(session.signer_email),
        issue,
      },
    });
    return response(200, {
      success: true,
      message:
        "The pack has been paused. Your agent will prepare a corrected replacement.",
    });
  }
  if (action === "sign-pack") {
    if (session.status === "signed") {
      const { data: completion, error: completionError } = await admin.rpc(
        "complete_private_listing_seller_signing_pack",
        {
          p_session_id: session.id,
          p_signed_name: text(session.signed_name),
          p_signature: text(session.signature),
          p_acceptance_ip: text(session.acceptance_ip),
          p_acceptance_user_agent: text(session.acceptance_user_agent),
          p_generated_documents: {},
        },
      );
      if (completionError || !completion) {
        return response(409, {
          success: false,
          error: completionError?.message ||
            "The saved signing result could not be recovered.",
        });
      }
      let serverRenderedArtifacts: RecordValue;
      try {
        serverRenderedArtifacts = await finaliseServerRenderedSignedPdfs(
          admin,
          session,
          orderDocuments(session.selected_documents),
          snapshot(session.signing_pack_snapshot),
          text(session.signed_name),
          text(session.signature),
          text(completion.signedAt || session.signed_at),
        );
      } catch (pdfError) {
        return response(500, {
          success: false,
          signatureSaved: true,
          error: pdfError instanceof Error
            ? pdfError.message
            : "The signed PDFs are still being finalised. Please retry.",
        });
      }
      const portalInvitations = completion.groupComplete === true
        ? await issueSellerPortalRecipientInvites(
          admin,
          url,
          serviceKey,
          session.id,
          text(session.organisation_id),
          text(snapshot(session.mandate_snapshot).propertyAddress) ||
            "your property",
          "Your agent",
        )
        : { attempted: false, deliveries: [] };
      return response(200, {
        success: true,
        signedAt: completion.signedAt,
        complete: true,
        groupComplete: completion.groupComplete === true,
        sellerPortalWorkspace: snapshot(completion.sellerPortalWorkspace),
        sellerPortalInvitations: portalInvitations,
        progress: completion.progress,
        serverRenderedArtifacts,
        idempotentReplay: true,
      });
    }
    const signedName = text(body.signedName);
    const signature = text(body.signature);
    const selectedDocuments = Array.isArray(session.selected_documents)
      ? session.selected_documents
      : ["mandate"];
    const isPrimaryDocumentContact =
      session.is_primary_document_contact !== false;
    if (!isPrimaryDocumentContact && text(session.signing_group_id)) {
      const { data: primarySession } = await admin.from(
        "private_listing_mandate_signing_sessions",
      )
        .select("status").eq("signing_group_id", session.signing_group_id).eq(
          "is_primary_document_contact",
          true,
        ).maybeSingle();
      if (primarySession?.status !== "signed") {
        return response(409, {
          success: false,
          error:
            "The primary document contact must complete the shared details and sign first.",
        });
      }
    }
    const acceptedDocuments = snapshot(body.acceptedDocuments);
    const missingAcceptance = selectedDocuments.find((documentKey: string) =>
      acceptedDocuments[documentKey] !== true
    );
    if (missingAcceptance || !signedName || !signature) {
      return response(400, {
        success: false,
        error: missingAcceptance
          ? `Review and accept the ${missingAcceptance} document before submitting.`
          : "Provide your full name and signature before submitting.",
      });
    }
    const frozenPack = snapshot(session.signing_pack_snapshot);
    const sellerResponses = isPrimaryDocumentContact
      ? snapshot(body.sellerResponses)
      : {};
    const disclosure = isPrimaryDocumentContact
      ? snapshot(sellerResponses.disclosure)
      : snapshot(frozenPack.disclosure);
    const disclosureResponses = snapshot(disclosure.responses);
    const fica = isPrimaryDocumentContact
      ? snapshot(sellerResponses.fica)
      : snapshot(frozenPack.seller);
    if (isPrimaryDocumentContact && selectedDocuments.includes("disclosure")) {
      const answers = disclosureQuestionKeys.map((key) =>
        text(snapshot(disclosureResponses[key]).answer)
      );
      if (answers.some((answer) => !["yes", "no", "unsure"].includes(answer))) {
        return response(400, {
          success: false,
          error: "Answer every property disclosure question before signing.",
        });
      }
    }
    if (isPrimaryDocumentContact && selectedDocuments.includes("fica")) {
      const missing = ficaDetailErrors(fica, snapshot(frozenPack.seller));
      if (missing.length) {
        return response(400, {
          success: false,
          error: `Add ${
            missing.join(", ")
          } before signing the FICA declaration.`,
        });
      }
    }

    let syncedPack = frozenPack;
    if (isPrimaryDocumentContact && selectedDocuments.includes("fica")) {
      try {
        syncedPack =
          (await syncSigningSellerDetails(admin, session, fica)).signingPack;
      } catch (saveError) {
        return response(500, {
          success: false,
          error: saveError instanceof Error
            ? saveError.message
            : "Seller details could not be saved. Please try again.",
        });
      }
    }
    const existingPack = syncedPack;
    const existingSeller = snapshot(existingPack.seller);
    const existingSellerLegalType = text(existingSeller.legalType)
      .toLowerCase();
    const entityFica = [
      "company",
      "close_corporation",
      "foreign_company",
      "trust",
      "foreign_trust",
      "deceased_estate",
    ].includes(existingSellerLegalType);
    const trustFica = ["trust", "foreign_trust"].includes(
      existingSellerLegalType,
    );
    const ficaSellerUpdate = entityFica
      ? trustFica
        ? {
          name: text(fica.entityName),
          trustName: text(fica.entityName),
          trustRegistrationNumber: text(fica.entityRegistrationNumber),
          trustRegisteredAddress: text(fica.registeredAddress),
        }
        : {
          name: text(fica.entityName),
          companyName: text(fica.entityName),
          companyRegistrationNumber: text(fica.entityRegistrationNumber),
          companyRegisteredAddress: text(fica.registeredAddress),
        }
      : {
        firstName: text(fica.firstName),
        surname: text(fica.surname),
        name: [text(fica.firstName), text(fica.surname)].filter(Boolean).join(
          " ",
        ),
        idNumber: text(fica.idNumber),
        dateOfBirth: text(fica.dateOfBirth),
        nationality: text(fica.nationality),
        countryOfResidence: text(fica.countryOfResidence),
        residentialAddress: text(fica.residentialAddress),
        incomeTaxNumber: text(fica.incomeTaxNumber),
        email: email(fica.email),
        phone: text(fica.phone),
        occupation: text(fica.occupation),
        sourceOfFunds: text(fica.sourceOfFunds),
      };
    const completedPack = isPrimaryDocumentContact
      ? {
        ...existingPack,
        disclosure: selectedDocuments.includes("disclosure")
          ? disclosure
          : snapshot(existingPack.disclosure),
        seller: {
          ...snapshot(existingPack.seller),
          ...(selectedDocuments.includes("fica") ? ficaSellerUpdate : {}),
        },
      }
      : frozenPack;
    if (isPrimaryDocumentContact && text(session.signing_group_id)) {
      const completedPackDigest = await hash(JSON.stringify(completedPack));
      const { error: fanoutError } = await admin.from(
        "private_listing_mandate_signing_sessions",
      )
        .update({
          signing_pack_snapshot: completedPack,
          signing_pack_digest: completedPackDigest,
          updated_at: new Date().toISOString(),
        })
        .eq("signing_group_id", session.signing_group_id).eq(
          "status",
          "active",
        );
      if (fanoutError) {
        return response(500, {
          success: false,
          error:
            "The completed shared details could not be prepared for every signer.",
        });
      }
    }
    if (isPrimaryDocumentContact) {
      const { data: onboarding } = await admin.from(
        "private_listing_seller_onboarding",
      ).select("form_data").eq("private_listing_id", session.private_listing_id)
        .maybeSingle();
      const formData = { ...snapshot(onboarding?.form_data) };
      const responseRecordedAt = new Date().toISOString();
      if (selectedDocuments.includes("disclosure")) {
        formData.propertyDisclosure = disclosure;
        formData.property_disclosure = disclosure;
        const declarations = snapshot(formData.propertyDisclosureDeclarations);
        const declaration = {
          signerName: text(session.signer_name),
          signerEmail: email(session.signer_email),
          responses: disclosureResponses,
          completedAt: responseRecordedAt,
        };
        formData.propertyDisclosureDeclarations = {
          ...declarations,
          [text(session.id)]: declaration,
        };
        formData.property_disclosure_declarations =
          formData.propertyDisclosureDeclarations;
      }
      if (selectedDocuments.includes("fica")) {
        const declarations = snapshot(formData.ficaDeclarations);
        const declaration = {
          signerName: text(session.signer_name),
          signerEmail: email(session.signer_email),
          idNumber: text(fica.idNumber),
          residentialAddress: text(fica.residentialAddress),
          incomeTaxNumber: text(fica.incomeTaxNumber),
          email: email(fica.email),
          phone: text(fica.phone),
          completedAt: responseRecordedAt,
        };
        formData.ficaDeclarations = {
          ...declarations,
          [text(session.id)]: declaration,
        };
        formData.fica_declarations = formData.ficaDeclarations;
        // Preserve the existing single-seller aliases for all downstream users,
        // but do not let a later co-owner overwrite the other owner's details.
        const signingPackSigners = Array.isArray(existingPack.signers)
          ? existingPack.signers
          : [];
        if (signingPackSigners.length <= 1) {
          formData.idNumber = declaration.idNumber;
          formData.sellerIdNumber = declaration.idNumber;
          formData.residentialAddress = declaration.residentialAddress;
          formData.residential_address = declaration.residentialAddress;
          formData.incomeTaxNumber = declaration.incomeTaxNumber;
          formData.email = declaration.email;
          formData.phone = declaration.phone;
        }
      }
      const { data: savedOnboarding, error: onboardingError } = await admin
        .from("private_listing_seller_onboarding")
        .update({ form_data: formData, updated_at: new Date().toISOString() })
        .eq("private_listing_id", session.private_listing_id)
        .select("id")
        .maybeSingle();
      if (onboardingError || !savedOnboarding) {
        return response(500, {
          success: false,
          error: onboardingError?.message ||
            "Seller details could not be saved. Please try again.",
        });
      }
    }
    const completedSession = {
      ...session,
      signing_pack_snapshot: completedPack,
    };
    const generatedDocuments = {
      ...Object.fromEntries(
        selectedDocuments.map((
          documentKey: string,
        ) => [
          documentKey,
          signedPackDocumentHtml(
            documentKey,
            completedSession,
            signedName,
            signature,
          ),
        ]),
      ),
      __acknowledgements: {
        contract: "seller_signing_acknowledgements_v1",
        acceptedDocuments: Object.fromEntries(
          selectedDocuments.map((
            documentKey: string,
          ) => [documentKey, acceptedDocuments[documentKey] === true]),
        ),
        electronicSignature: true,
      },
    };
    const { data: completion, error: completionError } = await admin.rpc(
      "complete_private_listing_seller_signing_pack",
      {
        p_session_id: session.id,
        p_signed_name: signedName,
        p_signature: signature,
        p_acceptance_ip:
          text(req.headers.get("x-forwarded-for")).split(",")[0] || "",
        p_acceptance_user_agent: text(req.headers.get("user-agent")),
        p_generated_documents: generatedDocuments,
      },
    );
    if (completionError || !completion) {
      return response(409, {
        success: false,
        error: completionError?.message ||
          "This signing link has expired or has already been used.",
      });
    }
    let serverRenderedArtifacts: RecordValue;
    try {
      serverRenderedArtifacts = await finaliseServerRenderedSignedPdfs(
        admin,
        completedSession,
        orderDocuments(selectedDocuments),
        completedPack,
        signedName,
        signature,
        text(completion.signedAt),
      );
    } catch (pdfError) {
      return response(500, {
        success: false,
        signatureSaved: true,
        error: pdfError instanceof Error
          ? pdfError.message
          : "Your signature was saved, but the final PDFs are still being prepared. Please retry.",
      });
    }
    const portalInvitations = completion.groupComplete === true
      ? await issueSellerPortalRecipientInvites(
        admin,
        url,
        serviceKey,
        session.id,
        text(session.organisation_id),
        text(snapshot(session.mandate_snapshot).propertyAddress) ||
          "your property",
        "Your agent",
      )
      : { attempted: false, deliveries: [] };
    return response(200, {
      success: true,
      signedAt: completion.signedAt,
      complete: true,
      groupComplete: completion.groupComplete === true,
      sellerPortalWorkspace: snapshot(completion.sellerPortalWorkspace),
      sellerPortalInvitations: portalInvitations,
      progress: completion.progress,
      serverRenderedArtifacts,
      idempotentReplay: completion.idempotentReplay === true,
    });
  }
  if (action !== "sign") {
    return response(400, { success: false, error: "Unknown signing action." });
  }
  if (session.signing_group_id) {
    return response(409, {
      success: false,
      error:
        "This signing pack must be completed together. Use the secure signing-pack form.",
    });
  }
  const documentKey = text(body.documentKey).toLowerCase();
  const selectedDocuments = Array.isArray(session.selected_documents)
    ? session.selected_documents
    : ["mandate"];
  if (
    !documentKeys.has(documentKey) || !selectedDocuments.includes(documentKey)
  ) {
    return response(400, {
      success: false,
      error: "That document is not included in this link.",
    });
  }
  const signedName = text(body.signedName);
  const signature = text(body.signature);
  const accepted = body.accepted === true;
  if (!accepted || !signedName || !signature) {
    return response(400, {
      success: false,
      error:
        "Accept the document and provide your signature before submitting.",
    });
  }
  const mandate = snapshot(session.mandate_snapshot);
  const title = documentKey === "disclosure"
    ? "Property condition disclosure"
    : documentKey === "fica"
    ? "FICA declaration"
    : "Exclusive mandate";
  const commission = String(mandate.commissionBasis).toLowerCase() === "fixed"
    ? `R ${text(mandate.commissionAmount)}`
    : `${text(mandate.commissionPercentage)}%`;
  const signedHtml = `<article><h1>${escapeHtml(title)}</h1><p>Property: ${
    escapeHtml(mandate.propertyAddress)
  }</p><p>Seller: ${escapeHtml(session.signer_name)}</p>${
    documentKey === "mandate"
      ? `<p>Commission: ${escapeHtml(commission)} ${
        escapeHtml(mandate.vatHandling)
      }</p>`
      : ""
  }<p>Accepted and signed by ${escapeHtml(signedName)}.</p><p>Signature: ${
    escapeHtml(signature)
  }</p></article>`;
  const { data: completion, error: completionError } = await admin.rpc(
    "complete_private_listing_seller_document_signing",
    {
      p_session_id: session.id,
      p_document_key: documentKey,
      p_signed_name: signedName,
      p_signature: signature,
      p_acceptance_ip: text(req.headers.get("x-forwarded-for")).split(",")[0] ||
        "",
      p_acceptance_user_agent: text(req.headers.get("user-agent")),
      p_generated_html: signedHtml,
      p_generated_file_name: `signed-${documentKey}.html`,
    },
  );
  if (completionError || !completion) {
    return response(409, {
      success: false,
      error: completionError?.message ||
        "This signing link has expired or has already been used.",
    });
  }
  let serverRenderedArtifacts: RecordValue;
  try {
    serverRenderedArtifacts = await finaliseServerRenderedSignedPdfs(
      admin,
      session,
      [documentKey],
      Object.keys(snapshot(session.signing_pack_snapshot)).length
        ? snapshot(session.signing_pack_snapshot)
        : {
          mandate: snapshot(session.mandate_snapshot),
          seller: { name: session.signer_name },
        },
      session.status === "signed" ? text(session.signed_name) : signedName,
      session.status === "signed" ? text(session.signature) : signature,
      text(completion.signedAt),
    );
  } catch (pdfError) {
    return response(500, {
      success: false,
      signatureSaved: true,
      error: pdfError instanceof Error
        ? pdfError.message
        : "Your signature was saved, but the final PDF is still being prepared. Please retry.",
    });
  }
  return response(200, {
    success: true,
    signedAt: completion.signedAt,
    complete: completion.complete,
    progress: completion.progress,
    serverRenderedArtifacts,
    idempotentReplay: completion.idempotentReplay === true,
  });
});
