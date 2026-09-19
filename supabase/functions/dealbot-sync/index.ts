import { withSupabase } from "npm:@supabase/server@1.6.0";
import { handle } from './handler.mjs';
import { githubBridge } from './github-auth.mjs';

// Server-to-server only. Authentication uses the existing Supabase secret mode.
const secretHandler = withSupabase({auth:'secret'}, (req,ctx)=>handle(req,ctx.supabaseAdmin));
export default { async fetch(req: Request) {
  if (req.headers.get('x-dealbot-auth') !== 'github-oidc') return secretHandler(req);
  return githubBridge(req, async (request: unknown) => {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const result = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/admitad_snapshot', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({request})
    });
    return result.ok ? {data: await result.json()} : {error: true};
  });
} };
