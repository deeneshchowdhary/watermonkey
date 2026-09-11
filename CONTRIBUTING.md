# Contributing to Water Monkey

Thanks for considering a contribution. Water Monkey is currently
solo-authored; this doc covers what to know before opening an issue or a
PR.

## Before you start

For anything beyond a small fix, open an issue first describing what
you'd like to change and why. This avoids spending time on a PR that
doesn't fit the project's direction — see [SPEC.md](SPEC.md) for the
current feature set and the product principles behind it.

## Contributor License Agreement

Water Monkey is dual-licensed (AGPLv3 + a separate commercial license —
see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)). That's only possible
because the project's copyright is currently held by a single author. To
accept outside code contributions while keeping that arrangement intact,
contributors will need to sign a Contributor License Agreement (CLA)
granting the project rights broad enough to keep dual-licensing the code.
The CLA process isn't set up yet — if you're planning a non-trivial PR,
mention it in your issue first so this can get sorted out before you put
in the work.

## Development setup

```bash
npm install
npm run tauri dev
```

See the [README](README.md#requirements) for platform prerequisites
(Node.js, Rust toolchain, Tauri's platform dependencies, optional Ollama).

## Before opening a PR

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --locked
```

All four are required in CI (`.github/workflows/ci.yml`) and must pass.

## Guidelines

- Keep changes scoped to the issue being addressed — avoid bundling
  unrelated refactors into a feature or fix PR.
- Add or update tests for any behavior change; see `src/**/*.test.js(x)`
  and `src-tauri/src/main.rs`'s `#[cfg(test)]` module for the existing
  patterns.
- New or changed destructive actions (anything that mutates a provider
  account) must go through an explicit confirmation step — see
  [SPEC.md](SPEC.md) §2.4.
- Never commit credentials, `.env` files, or signing keys. See the
  Security section in the [README](README.md#security).

## Reporting a bug

Include: OS and version, Water Monkey version, which provider(s) were
involved, and steps to reproduce. Do not include real credentials, access
tokens, or account IDs in a public issue — see
[SECURITY.md](SECURITY.md) if the bug is a security vulnerability rather
than a functional bug.
