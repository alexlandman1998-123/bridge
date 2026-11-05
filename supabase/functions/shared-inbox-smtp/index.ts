import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withApiCredentials } from '../_shared/apiCredentials.ts';
import { inboxSendingHandler } from '../_shared/inboxSendingHandlers.ts';
Deno.serve(withApiCredentials(inboxSendingHandler('smtp')));
