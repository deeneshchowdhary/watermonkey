# Security Policy

Water Monkey holds cloud provider credentials in the native OS keychain
and can perform destructive actions (deleting volumes, releasing IPs,
deleting Vercel projects) against a user's cloud accounts. Treat anything
that could leak a credential, bypass a confirmation step, or trigger a
provider mutation without explicit user action as a security issue.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Use GitHub's private reporting for this repository instead: go to the
**Security** tab → **Report a vulnerability**. This opens a private
advisory visible only to the maintainer until a fix is ready, which
avoids disclosing an exploitable issue before it's patched.

Include:
- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal repro is ideal).
- Affected version/commit.

Do not include real credentials, access tokens, or account identifiers in
a report — describe the credential type and scope instead.

## Scope

In scope:
- Credential storage or transmission (keychain handling, provider API
  calls, the Ollama data-disclosure boundary — see [SPEC.md](SPEC.md)
  §6.12).
- Any path that performs a provider mutation (delete/release) without
  going through the app's confirmation step (§2.4).
- Cross-site scripting or injection in the Tauri webview.
- Dependency vulnerabilities with a realistic exploitation path in this
  app (not just a CVE ID with no relevant code path).

Out of scope:
- Vulnerabilities requiring physical access to an already-compromised
  machine.
- Issues in a provider's own API or console, rather than in Water Monkey.
- Missing best-practice hardening with no demonstrated impact.

## Supported versions

Water Monkey is pre-1.0 and does not yet have a signed-release or
long-term-support track (see [RELEASING.md](RELEASING.md)). Security
fixes land on `main`; there is currently no older version receiving
backported patches.
