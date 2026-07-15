export const OTP_CANONICAL_RUNTIME_BINDING_VERSION = "kingstons_2026_otp_runtime_v1";
export const OTP_CANONICAL_TEMPLATE_ASSET_VERSION = "kingstons_2026_otp_docx_v1";

export const OTP_CANONICAL_TEMPLATE_TOKENS = Object.freeze([
  "cover_property_address", "cover_agent_name",
  "purchaser_1_full_name", "purchaser_1_identity_number", "purchaser_1_current_address", "purchaser_1_income_tax_number", "purchaser_1_vat_number",
  "purchaser_2_full_name", "purchaser_2_identity_number", "purchaser_2_current_address", "purchaser_2_income_tax_number", "purchaser_2_vat_number",
  "marital_anc_mark", "marital_community_mark", "marital_customary_mark", "marital_islamic_mark", "marital_unmarried_mark", "marital_foreign_law_mark",
  "property_physical_address", "property_erf_number", "property_township", "property_hoa_name",
  "offer_purchase_price", "offer_purchase_price_words", "offer_deposit_amount", "offer_cash_contribution", "offer_cash_fulfilment_date", "offer_cash_from_sale_proceeds",
  "offer_bond_finance_amount", "offer_linked_property_sale_amount", "offer_linked_property_minimum_price",
  "linked_property_physical_address", "linked_property_erf_number", "linked_property_registered_owner", "linked_property_bond_details",
  "other_suspensive_conditions", "other_suspensive_fulfilment_date", "offer_irrevocable_date",
  "occupation_after_registration_yes_mark", "occupation_after_registration_no_mark", "occupation_date", "occupation_occupational_rental", "offer_guarantee_delivery_period",
  "fixtures_additional_inclusions", "fixtures_exclusions", "special_conditions",
  "agency_name", "agency_ffc_number", "agent_name", "agent_ffc_number", "principal_name", "principal_ffc_number",
  "agency_physical_address", "agency_postal_address", "agency_vat_number", "agency_phone", "agency_email",
  "seller_1_full_name", "seller_1_identity_number", "seller_1_current_address", "seller_1_postal_address", "seller_1_vat_number",
  "seller_2_full_name", "seller_2_identity_number", "seller_2_current_address", "seller_2_postal_address", "seller_2_vat_number",
  "seller_bond_institution", "seller_bond_account_number", "seller_bond_outstanding_amount", "seller_bond_accounts_up_to_date", "seller_rates_account_number",
  "conveyancer_firm", "conveyancer_attorney", "conveyancer_physical_address", "conveyancer_phone", "conveyancer_email",
  "bond_applicant_1_full_time_mark", "bond_applicant_1_self_employed_mark", "bond_applicant_1_employer", "bond_applicant_1_employment_period",
  "bond_applicant_1_occupation", "bond_applicant_1_gross_income", "bond_applicant_1_spouse_income", "bond_applicant_1_bank",
  "bond_applicant_2_full_time_mark", "bond_applicant_2_self_employed_mark", "bond_applicant_2_employer", "bond_applicant_2_employment_period",
  "bond_applicant_2_occupation", "bond_applicant_2_gross_income", "bond_applicant_2_spouse_income", "bond_applicant_2_bank",
  "bond_regular_salary_mark", "bond_variable_income_mark", "bond_self_employed_mark",
  "purchaser_signing_place", "purchaser_signing_day", "purchaser_signing_month", "purchaser_signing_year_suffix",
  "seller_signing_place", "seller_signing_day", "seller_signing_month", "seller_signing_year_suffix",
  "agent_signing_place", "agent_signing_day", "agent_signing_month", "agent_signing_year_suffix",
  "purchaser_1_phone", "purchaser_1_email", "purchaser_2_phone", "purchaser_2_email",
  "seller_1_phone", "seller_1_email", "seller_2_phone", "seller_2_email", "agent_phone", "agent_email",
]);

const REQUIRED_TOKEN_GROUPS = Object.freeze([
  ["cover_property_address", "property_physical_address"],
  ["cover_agent_name", "agent_name"],
  ["purchaser_1_full_name"],
  ["purchaser_1_identity_number"],
  ["purchaser_1_current_address"],
  ["property_erf_number"],
  ["property_township"],
  ["offer_purchase_price"],
  ["offer_purchase_price_words"],
  ["agency_name"],
  ["agency_ffc_number"],
  ["agent_ffc_number"],
  ["principal_name"],
  ["principal_ffc_number"],
  ["agency_physical_address"],
  ["agency_phone"],
  ["agency_email"],
  ["seller_1_full_name"],
  ["seller_1_identity_number"],
  ["seller_1_current_address"],
]);

const MONTHS = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join("; ");
  return String(value).trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readPath(record, path) {
  const source = asRecord(record);
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function firstValue(roots, ...paths) {
  for (const path of paths.flat()) {
    for (const root of roots) {
      const value = readPath(root, path);
      if (Array.isArray(value) && value.length) return value;
      if (normalizeText(value)) return value;
    }
  }
  return "";
}

function joinName(first, last) {
  return [normalizeText(first), normalizeText(last)].filter(Boolean).join(" ");
}

function joinAddress(...parts) {
  return parts.flat().map(normalizeText).filter(Boolean).join(", ");
}

function coverAddressDisplay(value, maxLineLength = 42) {
  const parts = normalizeText(value).split(",").map((part) => part.trim()).filter(Boolean);
  let display = "";
  for (const part of parts) {
    const candidate = display ? `${display}, ${part}` : part;
    if (display && candidate.length > maxLineLength) break;
    display = candidate;
  }
  return display;
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeText(value).replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCanonicalOtpMoney(value, { symbol = false } = {}) {
  const amount = normalizeNumber(value);
  if (amount === null) return "";
  const formatted = new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount).replace(/\u00a0/g, " ");
  return symbol ? `R ${formatted}` : formatted;
}

function underThousand(value) {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const words = [];
  let remainder = value;
  if (remainder >= 100) {
    words.push(`${ones[Math.floor(remainder / 100)]} hundred`);
    remainder %= 100;
  }
  if (remainder >= 20) {
    words.push(`${tens[Math.floor(remainder / 10)]}${remainder % 10 ? `-${ones[remainder % 10]}` : ""}`);
  } else if (remainder > 0) words.push(ones[remainder]);
  return words.join(" ");
}

export function canonicalOtpAmountInWords(value) {
  const amount = normalizeNumber(value);
  if (amount === null || amount < 0 || amount >= 1_000_000_000_000) return "";
  const whole = Math.floor(amount);
  if (whole === 0) return "Zero rand";
  const groups = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
    [1, ""],
  ];
  let remainder = whole;
  const words = [];
  for (const [size, label] of groups) {
    const count = Math.floor(remainder / size);
    if (!count) continue;
    words.push([underThousand(count), label].filter(Boolean).join(" "));
    remainder %= size;
  }
  const result = `${words.join(" ")} rand`;
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function parseDate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCanonicalOtpDate(value) {
  const date = parseDate(value);
  return date ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : "";
}

function dateParts(value) {
  const date = parseDate(value);
  return date
    ? { day: String(date.getUTCDate()), month: MONTHS[date.getUTCMonth()], yearSuffix: String(date.getUTCFullYear()).slice(-2) }
    : { day: "", month: "", yearSuffix: "" };
}

function yesNo(value) {
  const key = normalizeKey(value);
  if (["yes", "true", "1", "y", "confirmed", "required", "up_to_date"].includes(key)) return "YES";
  if (["no", "false", "0", "n"].includes(key)) return "NO";
  return normalizeText(value).toUpperCase();
}

function employmentKind(value) {
  const key = normalizeKey(value);
  if (["self_employed", "business_owner", "director", "sole_proprietor"].includes(key)) return "self_employed";
  if (key) return "full_time";
  return "";
}

function approvedWording(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map(approvedWording).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const item = asRecord(value);
    const status = normalizeKey(item.status || item.approval_status || item.review_status);
    if (status && !["approved", "attorney_approved", "locked", "published"].includes(status)) return "";
    return normalizeText(item.wording || item.text || item.clause_text || item.value);
  }
  return normalizeText(value);
}

function directTokenOverrides(overrides) {
  return Object.fromEntries(
    OTP_CANONICAL_TEMPLATE_TOKENS
      .filter((token) => Object.prototype.hasOwnProperty.call(asRecord(overrides), token))
      .map((token) => [token, normalizeText(overrides[token])]),
  );
}

export function buildCanonicalOtpRuntimeBinding({
  transaction = {}, buyer = {}, unit = {}, development = {}, onboardingFormData = {},
  sourceContext = {}, legacyPlaceholders = {}, placeholderOverrides = {}, specialConditions = "",
} = {}) {
  const onboarding = asRecord(onboardingFormData);
  const context = asRecord(sourceContext);
  const overrides = asRecord(placeholderOverrides);
  const roots = [overrides, context, onboarding, asRecord(transaction), asRecord(buyer), asRecord(unit), asRecord(development), asRecord(legacyPlaceholders)];
  const pick = (...paths) => firstValue(roots, ...paths);
  const purchasers = Array.isArray(onboarding.purchasers) ? onboarding.purchasers : [];
  const purchaser1 = asRecord(purchasers[0]);
  const purchaser2 = asRecord(purchasers[1]);
  const company = asRecord(onboarding.company);
  const trust = asRecord(onboarding.trust);
  const purchaserType = normalizeKey(pick("purchaser_entity_type", "purchaser_type", "buyer.entity_type", "buyer.branch"));
  const entityBuyer = purchaserType === "company" ? company : purchaserType === "trust" ? trust : {};
  const sellers = Array.isArray(readPath(context, "seller.owners")) ? readPath(context, "seller.owners") : Array.isArray(context.sellers) ? context.sellers : [];
  const seller1 = asRecord(sellers[0]);
  const seller2 = asRecord(sellers[1]);
  const assignedAgent = asRecord(readPath(context, "transaction.assigned_agent") || context.agent);
  const agency = asRecord(context.organisation || context.organization || context.agency);
  const principal = asRecord(agency.principal_agent || agency.principalAgent || context.principal);
  const conveyancer = asRecord(readPath(context, "transaction.conveyancer") || context.conveyancer);
  const linkedProperty = asRecord(readPath(context, "transaction.linked_property") || context.linked_property);
  const signing = asRecord(context.signing);

  const primaryNaturalName = joinName(purchaser1.first_name || onboarding.first_name, purchaser1.last_name || onboarding.last_name);
  const purchaser1Name = normalizeText(
    purchaserType === "company" ? company.company_name : purchaserType === "trust" ? trust.trust_name : primaryNaturalName || pick("buyer_full_name", "buyer.name"),
  );
  const purchaser1Identity = normalizeText(
    purchaserType === "company"
      ? company.company_registration_number
      : purchaserType === "trust"
        ? trust.trust_registration_number
        : purchaser1.identity_number || purchaser1.passport_number || onboarding.identity_number || onboarding.passport_number || pick("buyer_id_number"),
  );
  const purchaser1Address = normalizeText(
    purchaserType === "company"
      ? company.company_registered_address
      : purchaserType === "trust"
        ? trust.trust_registered_address
        : joinAddress(purchaser1.street_address || onboarding.street_address, purchaser1.suburb || onboarding.suburb, purchaser1.city || onboarding.city, purchaser1.postal_code || onboarding.postal_code),
  );
  const purchaser2Name = joinName(purchaser2.first_name || onboarding.co_first_name, purchaser2.last_name || onboarding.co_last_name);
  const purchaser2Address = joinAddress(
    purchaser2.street_address || purchaser2.residential_address || onboarding.co_street_address || onboarding.co_residential_address,
    purchaser2.suburb || onboarding.co_suburb, purchaser2.city || onboarding.co_city, purchaser2.postal_code || onboarding.co_postal_code,
  );
  const propertyAddress = normalizeText(pick("property.physical_address", "property_physical_address", "property_address")) || joinAddress(unit.address_line1, unit.suburb, unit.city, unit.province);
  const purchasePrice = pick("finance.purchase_price", "purchase_price", "transaction.purchase_price", "transaction.sales_price");
  const employment1 = normalizeText(purchaser1.employment_type || onboarding.employment_type || pick("buyer.finance.applicants[0].employment.type"));
  const employment2 = normalizeText(purchaser2.employment_type || onboarding.co_employment_type || pick("buyer.finance.applicants[1].employment.type"));
  const incomeStructure = normalizeKey(purchaser1.employment_type || pick("finance.income_structure", "income_structure", "finance.employment_type", "employment_type"));
  const marital = normalizeKey(purchaser1.marital_regime || onboarding.marital_regime || purchaser1.marital_status || onboarding.marital_status);
  const isNatural = !["company", "trust", "other", "legal_entity"].includes(purchaserType);
  const occupationAfterRegistration = normalizeKey(pick("occupation.after_registration", "occupation_after_registration", "occupation_48_hours_after_registration"));

  const approvedSpecial = approvedWording(pick("transaction.approved_special_conditions", "approved_special_conditions", "conditions.special_conditions"));
  const approvedSuspensive = approvedWording(pick("transaction.approved_suspensive_conditions", "approved_suspensive_conditions", "conditions.other_suspensive_conditions"));
  const freeSpecial = normalizeText(specialConditions || pick("special_conditions"));
  const specialApprovedFlag = yesNo(pick("special_conditions_attorney_approved", "conditions.special_conditions_attorney_approved")) === "YES";

  const placeholders = Object.fromEntries(OTP_CANONICAL_TEMPLATE_TOKENS.map((token) => [token, ""]));
  Object.assign(placeholders, {
    cover_property_address: coverAddressDisplay(propertyAddress),
    cover_agent_name: normalizeText(assignedAgent.name || pick("agent_name", "transaction.assigned_agent.name")),
    purchaser_1_full_name: purchaser1Name,
    purchaser_1_identity_number: purchaser1Identity,
    purchaser_1_current_address: purchaser1Address,
    purchaser_1_income_tax_number: normalizeText(entityBuyer.company_tax_number || entityBuyer.trust_tax_number || purchaser1.tax_number || onboarding.tax_number),
    purchaser_1_vat_number: normalizeText(entityBuyer.vat_number || purchaser1.vat_number || onboarding.vat_number),
    purchaser_2_full_name: purchaser2Name,
    purchaser_2_identity_number: normalizeText(purchaser2.identity_number || purchaser2.passport_number || onboarding.co_identity_number || onboarding.co_passport_number),
    purchaser_2_current_address: purchaser2Address,
    purchaser_2_income_tax_number: normalizeText(purchaser2.tax_number || onboarding.co_tax_number),
    purchaser_2_vat_number: normalizeText(purchaser2.vat_number || onboarding.co_vat_number),
    marital_anc_mark: isNatural && ["anc", "out_of_community", "married_anc", "married_anc_accrual"].includes(marital) ? "X" : "",
    marital_community_mark: isNatural && ["in_community", "married_in_community", "community_of_property"].includes(marital) ? "X" : "",
    marital_customary_mark: isNatural && marital.includes("customary") ? "X" : "",
    marital_islamic_mark: isNatural && marital.includes("islamic") ? "X" : "",
    marital_unmarried_mark: isNatural && ["unmarried", "single", "divorced", "widowed", "individual", ""].includes(marital) ? "X" : "",
    marital_foreign_law_mark: isNatural && (marital.includes("foreign") || marital.includes("other_country")) ? "X" : "",
    property_physical_address: propertyAddress,
    property_erf_number: normalizeText(pick("property.erf_number", "listing.erf_number", "erf_number")),
    property_township: normalizeText(pick("property.township", "listing.township", "township")),
    property_hoa_name: normalizeText(pick("property.estate_or_hoa_name", "listing.complex_name", "hoa_name", "complex_name")),
    offer_purchase_price: formatCanonicalOtpMoney(purchasePrice),
    offer_purchase_price_words: canonicalOtpAmountInWords(purchasePrice),
    offer_deposit_amount: formatCanonicalOtpMoney(pick("transaction.deposit_amount", "deposit_amount")),
    offer_cash_contribution: formatCanonicalOtpMoney(pick("finance.cash_amount", "transaction.cash_amount", "cash_amount")),
    offer_cash_fulfilment_date: formatCanonicalOtpDate(pick("cash_fulfilment_date", "cash_contribution_fulfilment_date")),
    offer_cash_from_sale_proceeds: formatCanonicalOtpMoney(pick("transaction.cash_from_sale_proceeds", "cash_from_sale_proceeds")),
    offer_bond_finance_amount: formatCanonicalOtpMoney(pick("finance.bond_amount", "transaction.bond_amount", "bond_amount")),
    offer_linked_property_sale_amount: formatCanonicalOtpMoney(pick("transaction.linked_sale_amount", "linked_sale_amount")),
    offer_linked_property_minimum_price: formatCanonicalOtpMoney(pick("transaction.linked_sale_minimum_price", "linked_sale_minimum_price")),
    linked_property_physical_address: normalizeText(linkedProperty.address || pick("linked_property_address")),
    linked_property_erf_number: normalizeText(linkedProperty.erf_number || pick("linked_property_erf_number")),
    linked_property_registered_owner: normalizeText(linkedProperty.registered_owner || pick("linked_property_registered_owner")),
    linked_property_bond_details: normalizeText(linkedProperty.bond_details || pick("linked_property_bond_details")),
    other_suspensive_conditions: approvedSuspensive,
    other_suspensive_fulfilment_date: formatCanonicalOtpDate(pick("transaction.suspensive_condition_fulfilment_date", "suspensive_condition_fulfilment_date")),
    offer_irrevocable_date: formatCanonicalOtpDate(pick("transaction.irrevocable_offer_date", "irrevocable_offer_date", "offer_date")),
    occupation_after_registration_yes_mark: ["yes", "true", "1"].includes(occupationAfterRegistration) ? "X" : "",
    occupation_after_registration_no_mark: ["yes", "true", "1"].includes(occupationAfterRegistration) ? "" : "X",
    occupation_date: formatCanonicalOtpDate(pick("transaction.occupation_date", "occupation_date", "transaction.expected_transfer_date")),
    occupation_occupational_rental: formatCanonicalOtpMoney(pick("transaction.occupational_rent", "occupational_rent", "occupational_rental"), { symbol: true }),
    offer_guarantee_delivery_period: normalizeText(pick("transaction.guarantee_delivery_period", "guarantee_delivery_period")),
    fixtures_additional_inclusions: normalizeText(pick("transaction.fixture_inclusions", "fixture_inclusions", "fixtures.additional_inclusions")),
    fixtures_exclusions: normalizeText(pick("transaction.fixture_exclusions", "fixture_exclusions", "fixtures.exclusions")),
    special_conditions: approvedSpecial || (specialApprovedFlag ? freeSpecial : ""),
    agency_name: normalizeText(agency.legal_name || agency.name || pick("organisation.legal_name", "agency_name")),
    agency_ffc_number: normalizeText(agency.ffc_number || pick("organisation.ffc_number", "agency_ffc_number")),
    agent_name: normalizeText(assignedAgent.name || pick("transaction.assigned_agent.name", "agent_name")),
    agent_ffc_number: normalizeText(assignedAgent.ffc_number || pick("transaction.assigned_agent.ffc_number", "agent_ffc_number")),
    principal_name: normalizeText(principal.name || pick("organisation.principal_agent.name", "principal_name")),
    principal_ffc_number: normalizeText(principal.ffc_number || pick("organisation.principal_agent.ffc_number", "principal_ffc_number")),
    agency_physical_address: normalizeText(agency.physical_address || pick("organisation.physical_address", "agency_address")),
    agency_postal_address: normalizeText(agency.postal_address || pick("organisation.postal_address", "agency_postal_address")),
    agency_vat_number: normalizeText(agency.vat_number || pick("organisation.vat_number", "agency_vat_number")),
    agency_phone: normalizeText(agency.phone || pick("organisation.phone", "agency_phone")),
    agency_email: normalizeText(agency.email || pick("organisation.email", "agency_email")),
    seller_1_full_name: normalizeText(seller1.full_name || seller1.name || pick("seller.entity.legal_name", "seller_full_name")),
    seller_1_identity_number: normalizeText(seller1.id_number || seller1.identity_number || seller1.registration_number || pick("seller.entity.registration_number", "seller_id_or_registration")),
    seller_1_current_address: normalizeText(seller1.residential_address || seller1.registered_address || pick("seller.entity.registered_address", "seller_address")),
    seller_1_postal_address: normalizeText(seller1.postal_address || pick("seller.entity.postal_address", "seller_postal_address")),
    seller_1_vat_number: normalizeText(seller1.vat_number || pick("seller.entity.vat_number", "seller_vat_number")),
    seller_2_full_name: normalizeText(seller2.full_name || seller2.name),
    seller_2_identity_number: normalizeText(seller2.id_number || seller2.identity_number || seller2.registration_number),
    seller_2_current_address: normalizeText(seller2.residential_address || seller2.registered_address),
    seller_2_postal_address: normalizeText(seller2.postal_address),
    seller_2_vat_number: normalizeText(seller2.vat_number),
    seller_bond_institution: normalizeText(pick("seller.bond.institution", "seller_bond_institution")),
    seller_bond_account_number: normalizeText(pick("seller.bond.account_number", "seller_bond_account_number")),
    seller_bond_outstanding_amount: formatCanonicalOtpMoney(pick("seller.bond.outstanding_amount", "seller_bond_outstanding_amount"), { symbol: true }),
    seller_bond_accounts_up_to_date: yesNo(pick("seller.bond.accounts_up_to_date", "seller_bond_accounts_up_to_date")),
    seller_rates_account_number: normalizeText(pick("seller.rates_account_number", "seller_rates_account_number")),
    conveyancer_firm: normalizeText(conveyancer.firm || pick("transaction.conveyancer.firm", "conveyancer_firm")),
    conveyancer_attorney: normalizeText(conveyancer.name || conveyancer.attorney || pick("conveyancer_name")),
    conveyancer_physical_address: normalizeText(conveyancer.physical_address || conveyancer.address || pick("conveyancer_address")),
    conveyancer_phone: normalizeText(conveyancer.phone || pick("conveyancer_phone")),
    conveyancer_email: normalizeText(conveyancer.email || pick("conveyancer_email")),
    bond_applicant_1_full_time_mark: employmentKind(employment1) === "full_time" ? "X" : "",
    bond_applicant_1_self_employed_mark: employmentKind(employment1) === "self_employed" ? "X" : "",
    bond_applicant_1_employer: normalizeText(purchaser1.employer_name || purchaser1.business_name || onboarding.employer_name || onboarding.business_name),
    bond_applicant_1_employment_period: normalizeText(purchaser1.employment_period || purchaser1.years_in_business || onboarding.employment_period || onboarding.years_in_business),
    bond_applicant_1_occupation: normalizeText(purchaser1.job_title || purchaser1.occupation || onboarding.job_title || onboarding.occupation),
    bond_applicant_1_gross_income: formatCanonicalOtpMoney(purchaser1.gross_monthly_income || onboarding.gross_monthly_income, { symbol: true }),
    bond_applicant_1_spouse_income: formatCanonicalOtpMoney(purchaser2.gross_monthly_income || onboarding.co_gross_monthly_income, { symbol: true }),
    bond_applicant_1_bank: normalizeText(pick("finance.bond_bank_name", "bond_bank_name", "bank_name")),
    bond_applicant_2_full_time_mark: employmentKind(employment2) === "full_time" ? "X" : "",
    bond_applicant_2_self_employed_mark: employmentKind(employment2) === "self_employed" ? "X" : "",
    bond_applicant_2_employer: normalizeText(purchaser2.employer_name || purchaser2.business_name || onboarding.co_employer_name || onboarding.co_business_name),
    bond_applicant_2_employment_period: normalizeText(purchaser2.employment_period || purchaser2.years_in_business || onboarding.co_employment_period || onboarding.co_years_in_business),
    bond_applicant_2_occupation: normalizeText(purchaser2.job_title || purchaser2.occupation || onboarding.co_job_title || onboarding.co_occupation),
    bond_applicant_2_gross_income: formatCanonicalOtpMoney(purchaser2.gross_monthly_income || onboarding.co_gross_monthly_income, { symbol: true }),
    bond_applicant_2_spouse_income: purchaser2Name ? formatCanonicalOtpMoney(purchaser1.gross_monthly_income || onboarding.gross_monthly_income, { symbol: true }) : "",
    bond_applicant_2_bank: purchaser2Name ? normalizeText(pick("finance.bond_bank_name", "bond_bank_name", "bank_name")) : "",
    bond_regular_salary_mark: ["full_time", "permanent", "salary", "salaried"].includes(incomeStructure) ? "X" : "",
    bond_variable_income_mark: ["variable", "commission", "contract", "freelance"].includes(incomeStructure) ? "X" : "",
    bond_self_employed_mark: ["self_employed", "business_owner", "director", "sole_proprietor"].includes(incomeStructure) ? "X" : "",
    purchaser_1_phone: normalizeText(purchaser1.phone || onboarding.phone || pick("buyer_phone")),
    purchaser_1_email: normalizeText(purchaser1.email || onboarding.email || pick("buyer_email")),
    purchaser_2_phone: normalizeText(purchaser2.phone || onboarding.co_phone),
    purchaser_2_email: normalizeText(purchaser2.email || onboarding.co_email),
    seller_1_phone: normalizeText(seller1.phone), seller_1_email: normalizeText(seller1.email),
    seller_2_phone: normalizeText(seller2.phone), seller_2_email: normalizeText(seller2.email),
    agent_phone: normalizeText(assignedAgent.phone || pick("agent_phone")), agent_email: normalizeText(assignedAgent.email || pick("agent_email")),
  });

  for (const role of ["purchaser", "seller", "agent"]) {
    const roleRecord = asRecord(signing[role]);
    const parts = dateParts(roleRecord.date || pick(`signing.${role}.date`, `${role}_signing_date`));
    placeholders[`${role}_signing_place`] = normalizeText(roleRecord.place || pick(`signing.${role}.place`, `${role}_signing_place`));
    placeholders[`${role}_signing_day`] = parts.day;
    placeholders[`${role}_signing_month`] = parts.month;
    placeholders[`${role}_signing_year_suffix`] = parts.yearSuffix;
  }

  Object.assign(placeholders, directTokenOverrides(overrides));

  const missingRequiredTokens = REQUIRED_TOKEN_GROUPS
    .flatMap((group) => group.filter((token) => !normalizeText(placeholders[token])))
    .filter((token, index, values) => values.indexOf(token) === index);
  const reviewRequired = [];
  if (freeSpecial && !approvedSpecial && !specialApprovedFlag) reviewRequired.push("special_conditions");
  const unresolvedTokens = OTP_CANONICAL_TEMPLATE_TOKENS.filter((token) => !normalizeText(placeholders[token]));
  const blockers = [
    ...missingRequiredTokens.map((token) => ({ code: "required_value_missing", token, message: `${token.replace(/_/g, " ")} is required for the canonical OTP.` })),
    ...reviewRequired.map((token) => ({ code: "attorney_approval_required", token, message: `${token.replace(/_/g, " ")} must use approved wording or have explicit attorney approval.` })),
  ];

  return {
    schemaVersion: OTP_CANONICAL_RUNTIME_BINDING_VERSION,
    templateAssetVersion: OTP_CANONICAL_TEMPLATE_ASSET_VERSION,
    placeholders,
    requiredTokenCount: REQUIRED_TOKEN_GROUPS.flat().length,
    resolvedTokenCount: OTP_CANONICAL_TEMPLATE_TOKENS.length - unresolvedTokens.length,
    unresolvedTokens,
    missingRequiredTokens,
    attorneyReviewRequiredTokens: reviewRequired,
    blockers,
    ready: blockers.length === 0,
  };
}
