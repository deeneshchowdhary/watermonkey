# Water Monkey

Water Monkey is a local-first desktop application for finding avoidable cloud costs. It combines a React dashboard with a Rust/Tauri backend, native keychain storage, and optional local AI summaries through Ollama.

See [SPEC.md](SPEC.md) for the current feature specification, product principles, and the technical decisions behind them. See [docs/permissions-and-recovery.md](docs/permissions-and-recovery.md) for the permissions each provider needs, pricing assumptions behind every estimate, and how to recover from a failed remediation. See [RELEASING.md](RELEASING.md) for the signed-build/auto-update setup runbook.

## Why it's useful

Cloud bills quietly grow from things nobody is using: an EBS volume left behind after an instance was terminated, an Elastic IP that is no longer attached, a forgotten Vercel or Supabase project, a runaway OpenAI job. Each one is small, but they accumulate, and finding them normally means clicking through several provider consoles.

Water Monkey checks all of your providers in one place, estimates what each leftover resource costs per month, ranks findings by severity, and lets you act on them (or mark them reviewed) with a history of what changed.

- **Local-first and private.** There is no Water Monkey server or account. Credentials live in your OS keychain, scans run from your own machine straight to each provider, and nothing is sent anywhere else.
- **Safe by default.** Scanning needs read-only permissions. Deleting anything is optional, needs an extra permission you grant yourself, and always asks for confirmation.
- **Honest numbers.** Every estimate shows how it was calculated. They are directional estimates for prioritizing review, not invoices.
- **Nothing gets lost.** Findings persist across scans, so you can see what is new, what came back, and what disappeared.
- **Optional AI summary.** Get a short plain-English summary from a local Ollama model, without sending data to a hosted AI service.

## Who can use it

- **Solo developers and indie hackers** running side projects across AWS, Vercel, Supabase, and OpenAI who want to stop paying for forgotten resources.
- **Startup engineers and founders** without a dedicated FinOps tool who want a quick, no-signup cost cleanup pass.
- **DevOps and platform engineers** who want a read-only audit they can run against an account before a cleanup or a cost review.
- **Small cloud teams and consultants** who need a fast, credential-local way to review a client's or team's accounts without handing keys to a third-party SaaS.

It is a desktop app for macOS, Windows, and Linux. You will need credentials for the providers you want to scan; see [docs/permissions-and-recovery.md](docs/permissions-and-recovery.md) for the minimum permissions each one needs.

## Current capabilities

- Scan AWS (selectable regions), GCP (selectable zones), and Azure for unattached disks and unused/reserved IPs.
- Inspect inactive Vercel and Supabase projects, and OpenAI organization cost spikes.
- Configurable scan scope and pricing assumptions per provider, with an explanation attached to every finding's estimate.
- Read-only connection testing and guarded credential removal per provider, on top of native OS keychain storage.
- Persist findings across scans with a full lifecycle (open/acknowledged/resolved/missing/reopened) instead of losing history on every scan.
- Per-provider scan status with independent retry on failure.
- Search, sort, and filter findings by status; severity is computed from a single documented rule, not per-provider guesses.
- Generate local FinOps summaries using Ollama, with configurable endpoint/model and an opt-out.
- Review locally persisted scan and remediation activity.
- Delete supported AWS and Vercel resources after confirmation; Supabase deep-links to its dashboard for manual action; GCP and Azure findings are review-only.
- System/light/dark theme; usable down to narrower desktop window widths.

## Requirements

- Node.js 22.22 or newer (24 recommended)
- Rust toolchain
- Platform dependencies required by Tauri 1
- Ollama with `llama3.2:1b` (optional)

## Development

```bash
npm install
npm run tauri dev
```

Build the frontend independently with:

```bash
npm run build
```

Run the test suites:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Check the Rust backend with:

```bash
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

## Security

Credentials are stored through the native OS keychain and are not written to repository files. Provider requests either run locally in the Tauri backend or directly from the desktop webview. Never commit `.env` files, signing keys, or provider tokens.

## Status

Water Monkey is under active development. Review every remediation target carefully before confirming a destructive provider action.

## License

Water Monkey is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPLv3) — free to use, modify, and self-host, including commercially, under AGPLv3's terms. A commercial license is available for organizations that need different terms; see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
