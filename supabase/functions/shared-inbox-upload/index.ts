import "jsr:@supabase/functions-js@2.118.0/edge-runtime.d.ts";
import { withApiCredentials } from '../_shared/apiCredentials.ts';
import { inboxSendingHandler } from '../_shared/inboxSendingHandlers.ts';
Deno.serve(withApiCredentials(inboxSendingHandler('upload')));
