// WP12: Edge Function billing-webhook. Keeps public.entitlements in line with RevenueCat (see core.js).
//   POST /functions/v1/billing-webhook        RevenueCat webhook (Authorization: the secret typed in RevenueCat)
//   POST /functions/v1/billing-webhook/sync   the app, signed in, right after a purchase or restore (user JWT)
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   REVENUECAT_WEBHOOK_AUTH  any long random text; the same value goes in RevenueCat > Integrations > Webhooks >
//                            Authorization header value
//   REVENUECAT_SECRET_KEY    RevenueCat > Project settings > API keys > Secret API key (v1, starts with sk_)
//   BILLING_SANDBOX          "off" to ignore test purchases (leave unset on GFD Dev and while testing on Prod)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy: Actions > Deploy functions, or `supabase functions deploy billing-webhook --project-ref <ref>`.
import { handleSync, handleWebhook, webhookAllowed } from './core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function opts() {
  return {
    url: Deno.env.get('SUPABASE_URL') || '',
    key: Deno.env.get('SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    revenuecatKey: Deno.env.get('REVENUECAT_SECRET_KEY') || '',
    sandbox: (Deno.env.get('BILLING_SANDBOX') || '').toLowerCase() !== 'off',
  };
}

// who is calling, from their Supabase session token
async function userId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return (u && u.id) || null;
}

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: CORS });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const sync = new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/sync');
  try {
    if (sync) {
      const out = await handleSync(opts(), await userId(req));
      console.log(JSON.stringify({ event: 'billing_sync', status: out.status, ok: !!(out.body as { ok?: boolean }).ok }));
      return reply(out.status, out.body);
    }
    if (!webhookAllowed(req.headers.get('authorization'), Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || '')) {
      return new Response('Forbidden', { status: 403 });
    }
    const payload = await req.json().catch(() => null);
    const out = await handleWebhook(opts(), payload);
    // type and store only: no ids or emails in the logs
    console.log(JSON.stringify({ event: 'billing_webhook', type: payload?.event?.type, store: payload?.event?.store, status: out.status }));
    return reply(out.status, out.body);
  } catch (e) {
    console.error(JSON.stringify({ event: sync ? 'billing_sync' : 'billing_webhook', error: String((e as Error).message || e).slice(0, 200) }));
    return reply(500, { error: 'failed, try again' });
  }
});
