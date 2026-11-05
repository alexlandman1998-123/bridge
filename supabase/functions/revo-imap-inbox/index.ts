import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { handleImapSetup } from "../_shared/handleImapSetup.ts";
Deno.serve(withApiCredentials(req => handleImapSetup(req)));
