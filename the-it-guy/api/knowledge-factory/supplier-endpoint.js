export const KNOWLEDGE_FACTORY_UAT_V0_1_ENDPOINT =
  "https://propinfoapi.co.za/uat/v0_1/graphql/";

const UAT_V0_1_PATHS = new Set([
  "/uat/v0_1/graphql",
  "/uat/v0_1/graphql/",
  // Retained only for a no-downtime cutover before the 30 October 2026 retirement.
  "/live/uat/graphql",
  "/live/uat/graphql/",
]);

export function isKnowledgeFactoryV0_1UatEndpoint(value) {
  if (typeof value !== "string") return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" &&
      endpoint.hostname === "propinfoapi.co.za" &&
      !endpoint.port &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      UAT_V0_1_PATHS.has(endpoint.pathname);
  } catch {
    return false;
  }
}
