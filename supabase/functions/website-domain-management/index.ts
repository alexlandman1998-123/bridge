import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { createWebsiteDomainHandler } from "./handler.ts";

Deno.serve(withApiCredentials(createWebsiteDomainHandler()));
