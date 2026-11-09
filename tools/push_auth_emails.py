#!/usr/bin/env python3
"""Send GFD's sign-in emails, site address and (optionally) the email sender to a Supabase project (WP7).

Supabase keeps auth emails and SMTP settings in the dashboard, not in migrations. This copies them from the repo
(supabase/templates/, built by tools/build_pages.py from site/emails/ and site.json) through the Management API,
so production and staging match what's reviewed in the PR.

  # see what would change (nothing is sent)
  SUPABASE_ACCESS_TOKEN=sbp_... python3 tools/push_auth_emails.py --project zdllpjrkwcdmcuizxuum

  # send the emails + site address
  SUPABASE_ACCESS_TOKEN=sbp_... python3 tools/push_auth_emails.py --project zdllpjrkwcdmcuizxuum --apply

  # also switch to the custom email sender (password from the SMTP_PASS environment variable)
  SMTP_PASS=... ... --apply --smtp-host smtp.resend.com --smtp-port 465 --smtp-user resend

The access token is a personal token from supabase.com/dashboard/account/tokens. Don't save it in the repo.
Redirect URLs are only added, never removed, so preview and staging links keep working.
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "tools"))
import build_site  # noqa: E402

API = "https://api.supabase.com/v1/projects/{}/config/auth"
KINDS = ["confirmation", "recovery", "magic_link", "email_change", "invite", "reauthentication"]


def call(method, url, token, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "User-Agent": "gfd-push-auth-emails"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def wanted(args, current):
    v, report = build_site.build()
    gaps = sorted({g for gs in report.values() for g in gs})
    subjects = build_site.email_subjects()
    out = {}
    for k in KINDS:
        out[f"mailer_subjects_{k}"] = subjects[k]
        out[f"mailer_templates_{k}_content"] = (root / "supabase" / "templates" / f"{k}.html").read_text(encoding="utf-8")
    site = v["site_url"]
    out["site_url"] = site
    allow = [u for u in (current.get("uri_allow_list") or "").split(",") if u.strip()]
    # gfd://auth-callback: sign-in links that open the Android app (WP10)
    for u in (site, site + "**", build_site.load()["pages_url"], "gfd://auth-callback"):
        if u not in allow:
            allow.append(u)
    out["uri_allow_list"] = ",".join(allow)
    if args.smtp_host:
        if not v["sender_email"]:
            sys.exit("Set the domain in site.json first: the sender address is hello@<domain>.")
        pw = os.environ.get("SMTP_PASS")
        if not pw:
            sys.exit("Put the SMTP password in the SMTP_PASS environment variable.")
        out.update({"smtp_host": args.smtp_host, "smtp_port": str(args.smtp_port), "smtp_user": args.smtp_user,
                    "smtp_pass": pw, "smtp_admin_email": v["sender_email"], "smtp_sender_name": v["sender_name"]})
        if args.rate:
            out["rate_limit_email_sent"] = args.rate
    return out, gaps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True, help="Supabase project ref (production: zdllpjrkwcdmcuizxuum)")
    ap.add_argument("--apply", action="store_true", help="send the changes (default: only show them)")
    ap.add_argument("--smtp-host")
    ap.add_argument("--smtp-port", type=int, default=465)
    ap.add_argument("--smtp-user", default="resend")
    ap.add_argument("--rate", type=int, default=100, help="emails per hour once the custom sender is on")
    args = ap.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        sys.exit("Put a Supabase personal access token in SUPABASE_ACCESS_TOKEN.")
    url = API.format(args.project)
    current = call("GET", url, token)
    body, gaps = wanted(args, current)
    if gaps:
        print(f"Note: the policy pages still have gaps ({', '.join(gaps)}); emails link to them anyway.")
    changed = {k: v for k, v in body.items() if str(current.get(k) or "") != str(v)}
    for k in sorted(changed):
        shown = "(hidden)" if k == "smtp_pass" else (f"{len(changed[k])} characters" if k.endswith("_content") else changed[k])
        print(f"  {k}: {shown}")
    if not changed:
        print("Nothing to change.")
        return
    if not args.apply:
        print(f"{len(changed)} settings would change. Run again with --apply to send them.")
        return
    call("PATCH", url, token, changed)
    print(f"Done: {len(changed)} settings updated on {args.project}.")


if __name__ == "__main__":
    main()
