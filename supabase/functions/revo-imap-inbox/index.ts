import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";
import { withApiCredentials } from "../_shared/apiCredentials.ts";
import { handleImapSetup } from "../_shared/handleImapSetup.ts";
Deno.serve(withApiCredentials(req => handleImapSetup(req)));
