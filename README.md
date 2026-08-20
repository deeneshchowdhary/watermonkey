# Water Monkey

Water Monkey is a local-first desktop application for finding avoidable cloud costs. It combines a React dashboard with a Rust/Tauri backend, native keychain storage, and optional local AI summaries through Ollama.

See [SPEC.md](SPEC.md) for the complete current-feature specification, development backlog, acceptance criteria, and release requirements.

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

- Node.js 18 or newer
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
