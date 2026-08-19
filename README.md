# Water Monkey

Water Monkey is a local-first desktop application for finding avoidable cloud costs. It combines a React dashboard with a Rust/Tauri backend, native keychain storage, and optional local AI summaries through Ollama.

See [SPEC.md](SPEC.md) for the complete current-feature specification, development backlog, acceptance criteria, and release requirements.

## Current capabilities

- Scan AWS for unattached EBS volumes and unused Elastic IPs.
- Inspect inactive Vercel and Supabase projects.
- Detect OpenAI organization cost spikes.
- Store provider credentials in the native operating-system keychain.
- Generate local FinOps summaries using Ollama.
- Review locally persisted scan and remediation activity.
- Delete supported AWS and Vercel resources after confirmation.

GCP and Azure connections are present in the interface, but their live scanners are not implemented yet.

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

Check the Rust backend with:

```bash
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

## Security

Credentials are stored through the native OS keychain and are not written to repository files. Provider requests either run locally in the Tauri backend or directly from the desktop webview. Never commit `.env` files, signing keys, or provider tokens.

## Status

Water Monkey is under active development. Review every remediation target carefully before confirming a destructive provider action.
