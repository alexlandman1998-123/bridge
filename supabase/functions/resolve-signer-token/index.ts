import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { retiredDocumentGenerator } from '../_shared/retiredDocumentGenerator.ts';

Deno.serve(withApiCredentials(retiredDocumentGenerator));
