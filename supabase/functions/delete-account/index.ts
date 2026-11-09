// WP8: Edge Function delete-account. Deletes the accounts whose 7-day grace period is over (see core.js).
// Called once a day by .github/workflows/account-deletions.yml with the header x-cron-secret.
// Secrets (Supabase dashboard > Edge Functions > Secrets): DELETE_CRON_SECRET (any long random text, the same as the
// GitHub secret), later REVENUECAT_SECRET_KEY (WP12). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy: Actions > Deploy functions, or `supabase functions deploy delete-account --project-ref <ref>`.
import { runDeletions } from './core.js';

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('DELETE_CRON_SECRET') || '';
  if (req.method !== 'POST' || secret.length < 20 || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const out = await runDeletions({
      url: Deno.env.get('SUPABASE_URL'),
      key: Deno.env.get('SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      revenuecatKey: Deno.env.get('REVENUECAT_SECRET_KEY') || '',
    });
    // counts only: no ids, no emails
    console.log(JSON.stringify({ event: 'account_deletion_run', ...out }));
    return Response.json(out, { status: out.failed ? 500 : 200 });
  } catch (e) {
    console.error(JSON.stringify({ event: 'account_deletion_run', error: String((e as Error).message || e).slice(0, 200) }));
    return Response.json({ error: 'run failed' }, { status: 500 });
  }
});
