# Permissions, pricing assumptions, and remediation recovery

This is the user-facing companion to what's already enforced in the app —
each provider's Connections screen shows its own least-privilege note and
every finding shows its own estimate basis. This document collects all of
it in one place, plus what to do when a remediation attempt fails.

## 1. Permissions needed per provider

Grant only what's listed here. Extra permissions on a credential Water
Monkey holds are a real risk if that credential ever leaks — least privilege
is a product principle (SPEC.md §2.5), not just a suggestion.

| Provider | Scanning needs | Remediation needs (optional) |
|---|---|---|
| **AWS** | `ec2:DescribeVolumes`, `ec2:DescribeAddresses` | `ec2:DeleteVolume`, `ec2:ReleaseAddress` — add only if you want in-app deletion |
| **Vercel** | Read access to projects | Project deletion requires a full-access personal access token, not a read-only one |
| **Supabase** | Permission to list projects | None — Supabase remediation is a deep link to your Supabase dashboard, not an in-app action (see §3) |
| **OpenAI** | Organization admin scope, to read cost buckets | None — OpenAI findings are always review-only |
| **GCP** | `roles/compute.viewer` (or broader) on the project | None — GCP findings are always review-only |
| **Azure** | The **Reader** role on the subscription, granted to an app registration (service principal) — not a user account | None — Azure findings are always review-only |

If a credential only has the scanning-level permission, the app still works
fully — you just get **Review** instead of **Resolve** on that provider's
findings, which is the same thing you'd see for a provider that has no
remediation support at all (Supabase, OpenAI, GCP, Azure).

## 2. Pricing assumptions

Every finding's dollar estimate is a documented approximation, not a live
provider pricing lookup — hover or focus the ⓘ icon next to any dollar
figure in the findings table to see the exact calculation for that finding.

**Configurable** (Connections screen → select the provider → "Scan scope"
panel): change these any time; the new rate applies to the next scan.

| Provider | Default rate | What it estimates |
|---|---|---|
| AWS | $0.10/GB-month | Unattached EBS volume |
| AWS | $3.60/month flat | Unassigned Elastic IP |
| Vercel | $20.00/month flat | Inactive project (past the configurable inactivity threshold, default 60 days) |
| Supabase | $25.00/month flat | Idle/paused project |
| OpenAI | `(today's spend − baseline) × 30` | Cost spike (baseline window and multiplier are both configurable) |

**Fixed, not yet configurable** — GCP and Azure use a documented flat rate
rather than a live pricing API, and there's currently no UI to override
them (a possible future addition, not because the rate is guaranteed
accurate for your account):

| Provider | Default rate | What it estimates |
|---|---|---|
| GCP | $0.04/GB-month | Unattached persistent disk |
| GCP | $7.30/month flat | Reserved static IP not in use |
| Azure | $0.05/GB-month | Unattached managed disk |
| Azure | $3.65/month flat | Public IP with no configuration |

None of these numbers come from a live provider pricing API. Actual billing
depends on your specific account, region, disk type/tier, and any
commitment discounts you have — treat every figure as a directional
estimate for prioritizing review, not an invoice.

## 3. Recovering from a failed or uncertain remediation

**If a remediation attempt fails:** the finding stays visible in the table
(it is never removed on failure) and the confirmation dialog shows the
error message returned by the provider. Common causes:

- **Missing permission** — the credential doesn't have the delete/release
  permission listed in §1. Add it and retry, or leave the finding as a
  manual action in your provider's own console.
- **Resource state changed** — the resource was already deleted, modified,
  or is in a state that blocks the action (e.g. an EBS volume that became
  attached after the scan ran but before you confirmed). Re-run a scan; if
  the finding no longer appears, it will show as **Missing** in the table's
  status filter rather than silently disappearing (SPEC.md §6.8) — that's
  the app's own confirmation that the condition cleared, distinct from a
  successful in-app **Resolved** action.
- **Network/timeout** — retry once the connection issue clears. Nothing was
  changed on the provider side if the request never completed.

**If you're not sure whether a past remediation actually worked:**
check the finding's status in the table (the status filter next to search
defaults to "Active" — switch to "Resolved" or "All" to see it) and the
Activity log, which records every remediation attempt with its outcome. If
a finding you resolved reappears in a later scan, it moves to **Reopened**,
not back to a plain **Open** — this is a deliberate signal that something
you thought was handled came back, worth a closer look before treating it
as routine.

**Supabase specifically has no in-app remediation at all** (see §1) — the
confirmation dialog instead opens the project directly in your Supabase
dashboard so you can pause, resume, or delete it yourself with full
context. Water Monkey's own "Acknowledge" action only dismisses the finding
from your active view; it never mutates anything in your Supabase account.

**GCP, Azure, and OpenAI findings are acknowledge-only everywhere** — there
is currently no deletion path for any of these three, in-app or via deep
link. Acknowledging simply records that you've reviewed it.
