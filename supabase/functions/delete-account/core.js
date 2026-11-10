// WP8: the deletion run behind supabase/functions/delete-account (architecture 6.3).
// Plain JavaScript with fetch only, so the Edge Function (Deno) and the Node tests (tests/db/account-deletion.test.mjs)
// run exactly the same code.
//
// For every deletion request that is due (asked 7 days ago or more and not cancelled):
//   1. remove the person's files in storage (their folder in each bucket below)
//   2. delete their RevenueCat customer, once RevenueCat is set up (WP12; skipped while no key is given)
//   3. delete the auth user, which cascades to every table (profiles, data, history, feedback, consents,
//      entitlements and the request itself); the profiles trigger logs an account_deleted event with no id
// A failure leaves the request in place with attempts + 1 and a short reason, and the next run tries again.
// Couple links (WP15) are ended here too once they exist.

export const BUCKETS = ['suggestions', 'progress-photos'];   // each keeps a person's files under "<user id>/"
const PAGE = 100;

function headers(key, json) {
  // new-style keys (sb_secret_) go in apikey only; legacy JWT keys also as Bearer
  const h = { apikey: key };
  if (!key.startsWith('sb_')) h.Authorization = 'Bearer ' + key;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function ok(res, what, allow = []) {
  if (res.ok || allow.includes(res.status)) return res;
  const text = await res.text().catch(() => '');
  throw new Error(`${what}: ${res.status} ${text.slice(0, 200)}`);
}

// the requests whose grace period is over, oldest first: [{user_id, attempts}]
export async function dueRequests({ url, key, fetch: f = fetch, now = new Date(), limit = 50 }) {
  const q = `deletion_requests?select=user_id,attempts&due_at=lte.${encodeURIComponent(now.toISOString())}&order=due_at.asc&limit=${limit}`;
  const res = await ok(await f(`${url}/rest/v1/${q}`, { headers: headers(key) }), 'list due requests');
  return res.json();
}

// removes every file under "<uid>/" in one bucket; a bucket that doesn't exist yet counts as empty
export async function removeFiles({ url, key, fetch: f = fetch }, bucket, uid) {
  let removed = 0;
  for (let round = 0; round < 1000; round++) {
    const res = await f(`${url}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: headers(key, true),
      body: JSON.stringify({ prefix: uid, limit: PAGE, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (res.status === 400 || res.status === 404) {
      const text = await res.text().catch(() => '');
      if (/not.?found/i.test(text)) return removed;   // no such bucket (yet)
      throw new Error(`list ${bucket}: ${res.status} ${text.slice(0, 200)}`);
    }
    await ok(res, `list ${bucket}`);
    const items = await res.json();
    const files = items.filter((i) => i && i.id).map((i) => `${uid}/${i.name}`);
    const folders = items.filter((i) => i && !i.id && i.name).map((i) => `${uid}/${i.name}`);
    for (const sub of folders) removed += await removeFiles({ url, key, fetch: f }, bucket, sub);
    if (!files.length) return removed;
    await ok(await f(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE', headers: headers(key, true), body: JSON.stringify({ prefixes: files }),
    }), `remove from ${bucket}`);
    removed += files.length;
    if (items.length < PAGE && !folders.length) return removed;
  }
  throw new Error(`remove from ${bucket}: too many files`);
}

export async function deleteOne(opts, uid) {
  const { url, key, revenuecatKey, fetch: f = fetch } = opts;
  if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error('bad user id');
  let files = 0;
  for (const b of BUCKETS) files += await removeFiles(opts, b, uid);
  if (revenuecatKey) {
    await ok(await f(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + revenuecatKey },
    }), 'RevenueCat', [404]);
  }
  await ok(await f(`${url}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: headers(key) }), 'delete auth user', [404]);
  return { files };
}

async function noteFailure({ url, key, fetch: f = fetch, now = new Date() }, uid, attempts, err) {
  const reason = String((err && err.message) || err).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').slice(0, 500);
  await f(`${url}/rest/v1/deletion_requests?user_id=eq.${uid}`, {
    method: 'PATCH', headers: headers(key, true),
    body: JSON.stringify({ attempts: attempts + 1, last_attempt_at: now.toISOString(), last_error: reason }),
  }).catch(() => {});
}

// one run: returns counts only (no ids or emails, so the result can be logged)
export async function runDeletions(opts) {
  const { url, key } = opts;
  if (!url || !key) throw new Error('runDeletions needs url and key (service key)');
  const f = opts.fetch || fetch;
  const due = await dueRequests({ ...opts, fetch: f });
  const out = { due: due.length, deleted: 0, failed: 0, files: 0 };
  for (const r of due) {
    try {
      const d = await deleteOne({ ...opts, fetch: f }, r.user_id);
      out.deleted++; out.files += d.files;
    } catch (e) {
      out.failed++;
      await noteFailure({ ...opts, fetch: f }, r.user_id, r.attempts || 0, e);
    }
  }
  return out;
}
