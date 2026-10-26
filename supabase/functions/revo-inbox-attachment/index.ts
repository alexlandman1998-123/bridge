import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { handleInboxAttachment } from "../_shared/handleInboxAttachment.ts";
Deno.serve(withApiCredentials(req => handleInboxAttachment(req)));
