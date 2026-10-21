import { withApiCredentials } from "../_shared/apiCredentials.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.9";
import { createWorkerHandler } from "./handler.ts";
Deno.serve(withApiCredentials(createWorkerHandler({ createClient, env: (key) => Deno.env.get(key) })));
