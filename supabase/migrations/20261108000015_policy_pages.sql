-- WP7: publish the Terms of use and Privacy policy (FR-1.2, NFR-6, architecture 6.1).
--
-- The texts are static pages on the website, built from site/ and site.json by tools/build_site.py: privacy.html and
-- terms.html. This sets their versions in app_config.policies, which turns on the WP6 consent step:
--   * new accounts tick "I agree" on the sign-up form (recorded by the sign-up trigger),
--   * everyone already signed up is asked once, on their next open, before the app carries on.
-- The urls are relative, so they follow the site wherever it is served (GitHub Pages now, the custom domain later,
-- and the files bundled in the Android app).
--
-- Run this only after the pages are live with the owner's details filled in (site.json has no gaps).
-- The versions must match site.json "policies" (tests/site.test.js checks). Changing a text later = a new migration
-- with a new version, and everyone is asked again.

update public.app_config
set value = value || '{"terms": "2026.11.08", "privacy": "2026.11.08", "terms_url": "terms.html", "privacy_url": "privacy.html"}'::jsonb,
    note = 'Current version of each consent text. terms/privacy point at the pages built from site.json (WP7). Bump a version when its text changes: everyone is asked again on next open (terms, privacy).'
where key = 'policies';
