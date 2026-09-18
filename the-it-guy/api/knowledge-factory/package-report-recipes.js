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

const CURRENT_OWNERSHIP_FIELDS = `
  transfers(first: 5) {
    nodes {
      isCurrentOwner
      dateRegister
      buyers { buyerName buyerNameFix buyerType share }
    }
  }
`;

const FULL_REPORT_FIELDS = `
  valuationDate valuationMunicipality valuationReason valuationValue valuationZoning
  transfers(first: 5) {
    nodes {
      datePurchase dateRegister extent hasBond isCurrentOwner purchaseAmount purchaseReference
      buyers { buyerName buyerNameFix buyerType share }
      bonds(first: 5) {
        nodes { bondDateRegister bondInd isCurrentBond }
      }
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
      ? `${CORE_FIELDS} ${FULL_REPORT_FIELDS}`
      : `${CORE_FIELDS} ${CURRENT_OWNERSHIP_FIELDS}`;
  return `query ${operationName}($id: Int!) { propertyById(id: $id) { ${selection} } }`;
}
