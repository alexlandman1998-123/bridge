import { propertyReportQuery, supplierQueryFingerprint } from './supplier-contract.js';

const PACKAGE_PRODUCT_IDS = new Set([
  "basic_owner_lookup",
  "full_canvassing_report",
]);

const CORE_FIELDS = `
  deedsOfficeId erf extent hasCad hasDeeds hasNad hasTransfer parentFarm portion
  propertyId propertyName propertyNumber propertyType propertyYear schemeId unit
  streetAddress { address isMaster streetName streetNumber streetType }
  suburb { postCode suburbId suburbName town province { provinceName } }
`;

function currentOwnershipFields(includeFinance = false) { return `
  currentOwnership: transfers(first: 1, where: { isCurrentOwner: { eq: true } }) {
    nodes {
      isCurrentOwner
      dateRegister
      ${includeFinance ? "hasBond bonds(first: 5) { pageInfo { hasNextPage } nodes { bondDateRegister bondInd isCurrentBond } }" : ""}
      buyers(first: 20) { pageInfo { hasNextPage } nodes { buyerName buyerNameFix buyerType share } }
    }
  }
`; }

const FULL_REPORT_FIELDS = `
  valuationDate valuationMunicipality valuationReason valuationValue valuationZoning
  transfers(first: 5, order: { dateRegister: DESC }) {
    pageInfo { hasNextPage }
    nodes {
      datePurchase dateRegister extent hasBond isCurrentOwner purchaseAmount purchaseReference
    }
  }
`;

export const PACKAGE_COST_RECIPE_IDS = {
  basic_owner_lookup: "package_basic_v1",
  full_canvassing_report: "package_full_v1",
};

export function packageReportQuery(productId, operationName = "CanvassingReport") {
  if (!PACKAGE_PRODUCT_IDS.has(productId))
    throw new Error("Choose a supported report package.");
  const selection =
    productId === "full_canvassing_report"
      ? `${CORE_FIELDS} ${currentOwnershipFields(true)} ${FULL_REPORT_FIELDS}`
      : `${CORE_FIELDS} ${currentOwnershipFields()}`;
  return propertyReportQuery(selection, operationName);
}

export function packageReportQueryFingerprint(productId) {
  return supplierQueryFingerprint(packageReportQuery(productId));
}
