# Water Monkey — Specification

> **Note on this document's provenance.** The original planning document this
> codebase's inline comments cite (`SPEC §N.M`) is not part of this
> repository. This version was reconstructed from the shipped
> implementation — code, tests, and the docs in `docs/` — so that the
> section numbers those comments already reference resolve to something
> real. Treat it as a description of what Water Monkey **is today**, not as
> a historical backlog or a record of decisions as they were originally
> made.

## 1. Overview

Water Monkey is a local-first desktop application (React + Tauri/Rust) that
scans cloud and platform accounts for avoidable recurring cost — unattached
disks, unused reserved IPs, inactive projects, cost spikes — and tracks each
finding through a review/remediation lifecycle. There is no Water Monkey
backend: every scan runs from the user's own machine directly against each
provider's API, using credentials the user supplies and that never leave
local OS-native storage.

## 2. Product principles

### 2.1 Local-first
No Water Monkey server exists. Scans run from the desktop app straight to
each provider. Findings, activity history, settings, and theme are
persisted in the browser-webview's `localStorage`, not synced anywhere.

### 2.2 Read-only by default
Every provider connection needs only read/list permissions to scan. Any
remediation permission (delete, release) is a separate, optional grant the
user adds themselves — see §4.

### 2.3 Transparent, documented estimates
No finding's dollar figure comes from a live provider billing API. Every
estimate is computed from a documented, per-provider rate (see
`docs/permissions-and-recovery.md` §2), and every finding's estimate shows
its own calculation basis rather than presenting a number without context.

### 2.4 Confirm before destructive action
Any action that changes state on a provider (deleting an AWS volume or
releasing an EIP, deleting a Vercel project) requires an explicit
confirmation step and is never triggered by a scan or by opening the app.

### 2.5 Least privilege credentials
A credential should be granted only the permissions the features actually
in use need. Extra permissions on a credential Water Monkey holds are a
real risk if that credential ever leaks. See the per-provider scanning vs.
remediation permission split in `docs/permissions-and-recovery.md` §1 — a
credential with only scan-level access still fully works, it just yields
**Review** instead of **Resolve** on that provider's findings (§6.11).

## 3. Supported providers

| Provider | Scan coverage | Remediation |
|---|---|---|
| AWS | Unattached EBS volumes, unassigned Elastic IPs, across selectable regions | In-app delete/release |
| GCP | Unattached persistent disks, unused reserved static IPs, across selectable zones | Review-only |
| Azure | Unattached managed disks, unconfigured public IPs, subscription-wide | Review-only |
| Vercel | Inactive projects (past a configurable inactivity threshold) | In-app delete |
| Supabase | Idle/paused projects | Deep-link to Supabase dashboard (§6.6) |
| OpenAI | Organization cost spikes vs. a configurable baseline | Review-only |

## 4. Credential handling & storage

Credentials are written to the native OS keychain (macOS Keychain, Windows
Credential Manager, or the Linux Secret Service, via the Rust `keyring`
crate) through three Tauri commands: `save_credentials`,
`get_credentials`, `delete_credentials`. They are never written into
`localStorage`, application logs, or any file inside the repository or
build output.

Connection testing uses a closed vocabulary of probe outcomes so the UI
never has to guess at provider-specific error shapes (`src/lib/
credentialTester.js`, mirrored in `src-tauri/src/main.rs`):
`valid`, `invalid_credentials`, `insufficient_permissions`, `rate_limited`,
`network_error`, `format_error`, `unsupported`, `provider_error`,
`not_configured`.

Azure is the one provider whose credential is structured rather than a
bare key pair: tenant ID, client ID, and client secret for an Azure AD app
registration (service principal), using the OAuth2 client-credentials
flow — a defined identity model, not a raw bearer token (§6.5). It is
packed as JSON into the same generic `secretKey` slot the other providers
use, so the keychain commands stay provider-agnostic.

## 5. Scanning model

Each configured provider scans independently and reports one of
`succeeded | failed | skipped` (§6.7). A provider scan that does not
succeed — because it failed or because it isn't configured — leaves that
provider's previously persisted findings completely untouched; an outage
must never look like the underlying waste was resolved (§6.8).

## 6. Features

### 6.1 AWS scanning
Scans EC2 across a curated, user-selectable set of regions for unattached
EBS volumes and unassigned Elastic IPs.

### 6.2 Vercel and Supabase inspection
Vercel: lists projects and flags ones inactive past a configurable
threshold (default 60 days). Supabase: lists projects and flags idle/paused
ones.

### 6.3 OpenAI cost-spike detection
Compares recent organization spend against a configurable historical
baseline and multiplier; flags the delta as a finding rather than scanning
for idle resources (OpenAI has none to scan for).

### 6.4 GCP scanning
Read-only: unattached persistent disks and reserved-but-unused static
external IP addresses, across a curated set of zones/regions. All GCP
findings are non-remediable until a separate deletion spec exists.

### 6.5 Azure scanning
Uses the OAuth2 client-credentials flow (an Azure AD app registration /
service principal) — see §4. Read-only: unattached managed disks and
public IPs with no attached configuration. ARM's list APIs are
subscription-scoped rather than per-region, so unlike AWS/GCP there is no
region loop — one call each for disks and public IPs covers the whole
subscription. All Azure findings are non-remediable until a separate
deletion spec exists.

### 6.6 Supabase remediation is deep-link, not automated
Pausing, deleting, and downgrading a Supabase project are materially
different actions with different risk profiles, and Supabase findings
currently carry no revalidation of project state immediately before a
mutation — automating any of them is out of scope until that exists.
Confirming a Supabase finding instead opens the project directly in the
Supabase dashboard so the user acts with full context; Water Monkey's own
"Acknowledge" action stays a safe, reversible dismissal that never mutates
the Supabase account.

### 6.7 Per-provider scan status
Each provider shows its own status — `idle | scanning | succeeded | failed
| skipped` — instead of one fleet-level message, with independent retry
for a provider whose scan failed. Status is always communicated by icon
and text together, never color alone (§7.4).

### 6.8 Persisted finding lifecycle
Every finding a scan has ever surfaced is kept as a record with a status,
rather than vanishing once it drops out of an in-memory scan result:

| Status | Meaning |
|---|---|
| `open` | Currently reported by the provider, not yet actioned |
| `reopened` | Was `missing` or `resolved`, and has reappeared |
| `acknowledged` | User dismissed a review-only finding; persists across scans, not just for the current one (§12.4) |
| `resolved` | Remediation succeeded through the app |
| `missing` | Was open/acknowledged/reopened and the provider no longer reports it — inferred (deleted outside the app, or the condition cleared), not a confirmed in-app action |

"Active" (`open` + `reopened`) is what the dashboard and default table view
show; everything else stays in history rather than being silently dropped.

### 6.9 Unified severity calculation
Severity is a single, documented function of a finding's estimated monthly
loss, applied uniformly across every provider instead of per-scanner ad
hoc labels: `High` at ≥ $50/month, `Medium` at ≥ $10/month, `Low` below
that (`src/lib/severity.js`).

### 6.10 Search, sort, and status filtering
Findings can be searched, sorted, and filtered by status. The status
filter defaults to "Active" and can be switched to "Resolved" or "All" —
this is how a `missing` or `resolved` finding is inspected after it drops
out of the default view (see `docs/permissions-and-recovery.md` §3).

### 6.11 AWS and Vercel remediation
The only two providers with in-app destructive actions: AWS (delete an
EBS volume, release an Elastic IP) and Vercel (delete a project), each
gated on `remediable === true` and a credential that has the
corresponding write permission. Every other provider is acknowledge/
review-only (§3).

### 6.12 AI summaries via local Ollama
An opt-in feature that sends each finding's provider, resource type,
details string, monthly loss estimate, severity, and remediable flag —
plus the fleet total — to a locally configured Ollama endpoint for a
3-bullet executive summary. No credentials, account identifiers, or raw
provider API responses are ever included in that request
(`src/lib/ollamaClient.js`). The model's response is rendered as plain
text with no HTML/Markdown interpretation, since model output is
untrusted.

### 6.13 Theme, responsive layout, and dialog accessibility
System/light/dark theme, persisted locally and applied via a single
`dark` class toggle. Below `1024px` the sidebar collapses to an icon rail
rather than disappearing, since narrower desktop windows still need a way
to switch tabs. Every dialog traps Tab focus while open, closes on
Escape, and returns focus to whatever triggered it on close.

### 6.14 Testing strategy
Frontend: Vitest + Testing Library, with provider HTTP calls exercised
against real request/response shapes rather than hand-rolled mocks where
practical. Rust: provider HTTP calls are mocked via `mockito`, with the
base URL injected through `_at`-suffixed helper functions so production
code paths are unchanged. Keychain-touching Rust tests are marked
`#[ignore]` since they need a real OS keychain that a typical CI container
doesn't have — run them explicitly with `cargo test -- --ignored` on a
machine that has one.

## 7. Quality attributes

### 7.1 No telemetry
Water Monkey does not phone home. The only outbound network calls are the
ones a scan, a credential test, a remediation action, or the opt-in Ollama
summary explicitly makes.

### 7.2 Data minimization
Only what a feature needs is ever sent anywhere — see the Ollama
disclosure in §6.12 as the clearest example of this being an explicit,
documented boundary rather than an implicit assumption.

### 7.3 Bounded local persistence
Findings and activity history are capped (500 records, 250 events
respectively). Every record still needing attention (`open`,
`acknowledged`, `reopened`) is always kept; only `resolved`/`missing`
history is trimmed, oldest-by-`lastSeenAt` first, once the cap is
exceeded.

### 7.4 Accessibility
State is always communicated by icon/text together, never color alone
(§6.7). Dialogs are keyboard-navigable: focus is trapped inside while
open and restored to the trigger element on close (§6.13).

## 8. Non-goals (current)

- Automated remediation for GCP, Azure, Supabase, or OpenAI findings (§3,
  §6.6).
- Any server-side component, account system, or cross-device sync (§2.1).
- Live provider billing API integration for cost estimates (§2.3) —
  estimates are documented approximations by design, not a missing
  feature.

## 9. Technical foundations & release readiness

**Storage.** `localStorage` data is wrapped as `{ version, data }` and
migrated forward through a per-key migration chain on load, so a schema
change never silently drops or corrupts a user's existing findings or
activity history. Data written before this wrapper existed has no
`version` field and is treated as version 0.

**Testing.** See §6.14.

**Required for a production 1.0 release** (not yet done — see
[RELEASING.md](RELEASING.md) for the full runbook):
- Signed, notarized macOS builds and (recommended) Authenticode-signed
  Windows builds — unsigned builds trigger OS-level "unidentified
  developer" warnings on first launch.
- A working auto-updater with a real Tauri updater keypair, verified by
  actually shipping an update to an old build, not just by a build
  pipeline succeeding.

## 10. Known limitations

- GCP and Azure pricing rates are fixed and not yet user-configurable
  (`docs/permissions-and-recovery.md` §2).
- Vercel and AWS are the only providers with any in-app remediation
  (§6.11); everything else is acknowledge-only (§3).
- No CI job currently runs the Rust `#[ignore]`d keychain tests (§6.14) —
  they require a real OS keychain unavailable in the CI containers used
  today.

## 11. Out of scope for this document

Business, pricing, and go-to-market decisions are intentionally not part
of this file — see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for the
licensing side of that.

## 12. Decision log

Notable product decisions that shaped the current implementation, kept
here so the reasoning isn't lost:

- **12.1** Severity is computed from estimated monthly loss alone, not a
  per-provider label, so a large leak is always more severe than a small
  one regardless of which provider produced it (§6.9).
- **12.2** Azure's credential model is a defined OAuth2 client-credentials
  identity (tenant/client ID + secret), not an ambiguous "client secret or
  bearer token" field (§6.5).
- **12.3** Supabase remediation stays a dashboard deep-link rather than an
  automated action, pending pre-mutation state revalidation that doesn't
  exist yet (§6.6).
- **12.4** Acknowledging a review-only finding is a persistent status that
  carries forward across scans, not a per-scan dismissal that would need
  to be repeated every time the same finding reappears (§6.8).
