# Site brief: domain, policy pages and sign-in emails (WP7)

Everything public-facing that depends on who runs GFD and where it lives comes from **one file, `site.json`**, and is
rebuilt by `python3 tools/build_pages.py` (which runs `tools/build_site.py`). CI fails if the built files are stale.

| Source | Built file | Served as |
|---|---|---|
| `site/shell.html` + `site/privacy.html` | `privacy.html` | `<site>/privacy.html` |
| `site/shell.html` + `site/terms.html` | `terms.html` | `<site>/terms.html` |
| `site/emails/_frame.html` + `site/emails/<kind>.html` | `supabase/templates/<kind>.html` | Supabase auth emails |
| `site.json` `domain` | `CNAME` (only when set) | GitHub Pages custom domain |

Templates use `{{name}}` (see `values()` in `tools/build_site.py`). An empty value shows as a highlighted gap; while
any gap is left, the page shows a "Draft" banner and is marked `noindex`. Supabase's own variables
(`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`) pass through untouched. The first line
of each email source is `Subject: ...`.

## The domain placeholder

`site.json` → `"domain": ""`. Empty means "not bought yet": links use `pages_url` (GitHub Pages), emails link there,
and no `CNAME` is written. Contact addresses are `<local part>@<domain>` (`hello@`, `privacy@`; the sender is `hello@`).

When the domain is bought:

1. Set `"domain": "example.com"` in `site.json`, run `python3 tools/build_pages.py`, commit (this adds `CNAME`).
2. DNS at the registrar: for an apex domain, A records to GitHub Pages (185.199.108.153, .109.153, .110.153, .111.153)
   and AAAA records (2606:50c0:8000::153, 8001, 8002, 8003); `www` as a CNAME to `do-mict.github.io`.
   GitHub repo → Settings → Pages: custom domain, then tick "Enforce HTTPS" once the certificate is issued.
   The old `do-mict.github.io/workout-tracker/` links redirect to the domain automatically.
3. Email sender (Resend free tier is the default choice; Brevo works the same way): add the domain there, add the DNS
   records it shows (SPF, DKIM, and a DMARC record such as `v=DMARC1; p=none; rua=mailto:privacy@<domain>`), create
   an SMTP key. Set up receiving for `hello@` and `privacy@` (registrar forwarding or a mailbox).
4. `SUPABASE_ACCESS_TOKEN=... SMTP_PASS=... python3 tools/push_auth_emails.py --project <ref> --apply --smtp-host smtp.resend.com`
   once for staging and once for production. Without `--apply` it only shows what would change. It sets the site
   URL, adds redirect URLs (never removes), the six email templates and subjects, and the sender.
   Without `--smtp-host` it sends only the emails and site URL.

The database urls in `app_config.policies` are relative (`terms.html`, `privacy.html`), so they don't change with the
domain. The Android app (WP10) bundles the same pages.

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
