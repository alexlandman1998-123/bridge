import assert from "node:assert/strict";
import {
  isKnowledgeFactoryV0_1UatEndpoint,
  KNOWLEDGE_FACTORY_UAT_V0_1_ENDPOINT,
} from "../api/knowledge-factory/supplier-endpoint.js";

assert.equal(
  KNOWLEDGE_FACTORY_UAT_V0_1_ENDPOINT,
  "https://propinfoapi.co.za/uat/v0_1/graphql/",
);
for (const endpoint of [
  KNOWLEDGE_FACTORY_UAT_V0_1_ENDPOINT,
  "https://propinfoapi.co.za/uat/v0_1/graphql",
  "https://propinfoapi.co.za/live/uat/graphql/",
]) {
  assert.equal(isKnowledgeFactoryV0_1UatEndpoint(endpoint), true, endpoint);
}
for (const endpoint of [
  "https://propinfoapi.co.za/uat/v1/graphql/",
  "https://propinfoapi.co.za/uat/latest/graphql/",
  "https://propinfoapi.co.za/live/v0_1/graphql/",
  "https://other.example/uat/v0_1/graphql/",
  "http://propinfoapi.co.za/uat/v0_1/graphql/",
  "https://propinfoapi.co.za/uat/v0_1/graphql/?query=1",
  "https://propinfoapi.co.za/uat/v0_1/graphql/#fragment",
  "not a URL",
]) {
  assert.equal(isKnowledgeFactoryV0_1UatEndpoint(endpoint), false, endpoint);
}

console.log("Knowledge Factory v0_1 UAT endpoint cutover checks passed.");
