# Site brief: domain, policy pages and sign-in emails (WP7)

Everything public-facing that depends on who runs GFD and where it lives comes from **one file, `site.json`**, and is
rebuilt by `python3 tools/build_pages.py` (which runs `tools/build_site.py`). CI fails if the built files are stale.

| Source | Built file | Served as |
|---|---|---|
| `site/shell.html` + `site/privacy.html` | `privacy.html` | `<site>/privacy.html` |
| `site/shell.html` + `site/terms.html` | `terms.html` | `<site>/terms.html` |
| `site/shell.html` + `site/delete-account.html` | `delete-account.html` | `<site>/delete-account.html` (WP8, Google Play's deletion link; uses the app's Supabase URL and key from `src/js/signin.js`) |
| `site/emails/_frame.html` + `site/emails/<kind>.html` | `supabase/templates/<kind>.html` | Supabase auth emails |
| `site.json` `domain` | `CNAME` (only when set) | GitHub Pages custom domain |

Templates use `{{name}}` (see `values()` in `tools/build_site.py`). An empty value shows as a highlighted gap; while
any gap is left, the page shows a "Draft" banner and is marked `noindex`. Supabase's own variables
(`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`) pass through untouched. The first line
of each email source is `Subject: ...`.

## The domain placeholder

`site.json` → `"domain": ""`. Empty means "not bought yet": links use `pages_url` (GitHub Pages), emails link there,
and no `CNAME` is written. Contact addresses are `<local part>@<domain>` (`hello@`, `privacy@`; the sender is `hello@`).

Bought 10 Nov 2026: **getfitdaily.co.za**, set in `site.json`. The site is hosted in Coolify (see `docs/db-brief.md`,
"Hosting"), not GitHub Pages: DNS A records for the apex, `www` and `dev` point at the Coolify server. Mail: ImprovMX
receives (forwards to Deon), Brevo sends (SPF/DKIM/DMARC records in place). Step 2 below is the GitHub Pages way and is
no longer used; the `CNAME` file only makes old GitHub Pages links redirect to the domain.

When the domain was bought (original steps):

1. Set `"domain": "example.com"` in `site.json`, run `python3 tools/build_pages.py`, commit (this adds `CNAME`).
2. DNS at the registrar: for an apex domain, A records to GitHub Pages (185.199.108.153, .109.153, .110.153, .111.153)
   and AAAA records (2606:50c0:8000::153, 8001, 8002, 8003); `www` as a CNAME to `do-mict.github.io`.
   GitHub repo → Settings → Pages: custom domain, then tick "Enforce HTTPS" once the certificate is issued.
   The old `do-mict.github.io/workout-tracker/` links redirect to the domain automatically.
3. Email sender (Resend free tier is the default choice; Brevo works the same way): add the domain there, add the DNS
   records it shows (SPF, DKIM, and a DMARC record such as `v=DMARC1; p=none; rua=mailto:privacy@<domain>`), create
   an SMTP key. Set up receiving for `hello@` and `privacy@` (registrar forwarding or a mailbox).
4. `SUPABASE_ACCESS_TOKEN=... SMTP_PASS=... python3 tools/push_auth_emails.py --project <ref> --apply --smtp-host smtp.resend.com`
   once for GFD Dev and once for GFD Prod (`--env dev`, `--env production`). Without `--apply` it only shows what would change. It sets the site
   URL, adds redirect URLs (never removes), the six email templates and subjects, and the sender.
   Without `--smtp-host` it sends only the emails and site URL.

The database urls in `app_config.policies` are relative (`terms.html`, `privacy.html`), so they don't change with the
domain. The Android app (WP10) bundles the same pages.

## Google sign-in (WP11)

The Continue with Google button on the sign-in and sign-up screens appears by itself once a project has the Google
provider on (the app asks `/auth/v1/settings`), so nothing breaks before setup. New Google accounts get the terms and
privacy screen after sign-in (they skip the sign-up tick box) and take their first name from Google. Same accounts as
email: Supabase links a Google sign-in to an existing account with the same confirmed email.

Setup, once (one Google client serves GFD Prod and GFD Dev):
1. console.cloud.google.com → a project for GFD → Google Auth Platform (OAuth consent screen): External; app name
   GFD · Get Fit Daily; support email; home page `https://getfitdaily.co.za/`; privacy `…/privacy.html`; terms
   `…/terms.html`; authorised domains `getfitdaily.co.za` and `supabase.co`. Scopes: only `openid`, `email`, `profile`
   (no review needed for these). Audience → Publish app, or only listed test users can sign in.
2. Clients → Create client → Web application. Authorised JavaScript origins: `https://getfitdaily.co.za`,
   `https://dev.getfitdaily.co.za`. Authorised redirect URIs: `https://zdllpjrkwcdmcuizxuum.supabase.co/auth/v1/callback`
   and `https://incujtxyxtygehpkgtwz.supabase.co/auth/v1/callback`. Copy the client ID and secret.
3. Easiest: add repository secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then run Actions → Push sign-in
   settings → dev / apply, then production / apply. Or locally for each project: `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… SUPABASE_ACCESS_TOKEN=… python3
   tools/push_auth_emails.py --env dev --apply --google` (then `--env production`). Or by hand: Authentication → Sign In /
   Providers → Google → on, paste both, save; and check URL Configuration lists the site and `gfd://auth-callback`.

Google's screen says "continue to <ref>.supabase.co" until the project has a Supabase custom domain (a paid add-on,
e.g. `auth.getfitdaily.co.za`); then add that domain's `/auth/v1/callback` to the client too.

## Changing a policy text

- Typos and filling gaps before anyone has agreed: edit `site/` or `site.json`, rebuild. No version change.
- A real change after launch: edit, bump the version in `site.json` `policies` (date style, `2026.12.01`), update
  `effective`, and add a migration that sets the same version in `app_config.policies` (copy
  `20261108000015_policy_pages.sql`). `tests/site.test.js` fails if the two disagree. Everyone is asked to agree again
  on their next open. Keep the old text (git history) for "earlier versions on request".

## What the policies promise (keep the app in step)

The privacy policy describes WP1–WP6 as built, plus the planned Pro purchases (Google Play, RevenueCat, Paddle),
health details (WP9, opt-in) and account deletion in the app (WP8). If a later work package changes what's stored,
who processes it or how long it's kept, update `site/privacy.html` in the same PR. Retention numbers quoted: events 400
days, error reports 90 days, deletion within 30 days, trial check code kept.

Not legal advice: Deon should have the texts read by someone qualified before launch (backlog B3).

## Link preview (WhatsApp, Facebook, X, LinkedIn)

`tools/build_pages.py` adds Open Graph and Twitter tags to `index.html`, with absolute URLs on the `site.json` domain.
The images are `icons/share-card.png` (1200 × 630, shown first) and `icons/share-square.png` (600 × 600), drawn by
`node tools/build_share_images.js` (reversed logo on ink). Keep each under ~300 KB or WhatsApp drops the picture.
Previews only work on the public site: dev.getfitdaily.co.za is behind a password, so crawlers can't read it.
WhatsApp caches a preview per link for a while; add `?v=2` to test a change straight away.
