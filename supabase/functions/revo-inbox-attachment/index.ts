import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { handleInboxAttachment } from "../_shared/handleInboxAttachment.ts";
Deno.serve(withApiCredentials(req => handleInboxAttachment(req)));
