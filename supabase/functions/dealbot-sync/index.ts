import { withSupabase } from "npm:@supabase/server@1.6.0";
import { handle } from './handler.mjs';

// Server-to-server only. Authentication uses the existing Supabase secret mode.
export default { fetch: withSupabase({auth:'secret'}, (req,ctx)=>handle(req,ctx.supabaseAdmin)) };
