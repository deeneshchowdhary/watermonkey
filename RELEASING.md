# Releasing Water Monkey

**Status: not set up yet.** This document is the runbook for signed builds and
the auto-updater — SPEC.md §9 lists both as required for a production 1.0.
Nothing below is active in `tauri.conf.json` yet, because every step needs a
real credential (an Apple Developer ID, a Windows code-signing certificate, a
Tauri updater keypair) that does not exist for this project. Flipping on
`updater.active` or wiring the release workflow with placeholder values
would not just be a no-op — Tauri's updater panics
(`.expect("Unable to open pubkey")` in `tauri::updater::core`) if it tries to
verify a signature against an invalid key, so a fake config would actively
break the app for real users the first time they checked for an update. This
is written so a real release can be set up correctly when the credentials
exist, not as something to fake in the meantime.

## What "signed" means per platform

- **macOS:** the app must be signed with an Apple Developer ID Application
  certificate and notarized by Apple, or Gatekeeper blocks it on first launch
  with an "unidentified developer" warning users have to manually override.
  Requires an active Apple Developer Program membership.
- **Windows:** the app should be signed with an Authenticode code-signing
  certificate, or SmartScreen shows an "unrecognized app" warning. Optional
  compared to macOS notarization, but strongly recommended — unsigned +
  auto-updating together look exactly like a supply-chain attack pattern to
  antivirus heuristics.
- **Linux:** no OS-level signing requirement; package repositories (if
  distributed that way) may want a GPG-signed release instead.

## Setup checklist (one-time)

1. **Apple Developer ID Application certificate** (macOS signing) — from an
   active Apple Developer Program membership. Export as a `.p12` file.
2. **Apple notarization credentials** — an app-specific password or API key
   for `notarytool`, tied to the same Apple ID.
3. **Windows code-signing certificate** (optional but recommended) — from a
   certificate authority (e.g. DigiCert, SSL.com).
4. **Tauri updater signing keypair** — generated locally, never committed:
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/watermonkey-updater.key
   ```
   This prints a public key (goes in `tauri.conf.json`'s `updater.pubkey`)
   and writes a private key file (goes in CI as a secret, never in the repo).
5. Add these as **GitHub repository secrets** (Settings → Secrets and
   variables → Actions), matching the names the release workflow expects:
   - `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
   - `WINDOWS_CERTIFICATE` (optional), `WINDOWS_CERTIFICATE_PASSWORD` (optional)
   - `TAURI_PRIVATE_KEY` (the file from step 4), `TAURI_KEY_PASSWORD`

## Once credentials exist

1. Add the real public key to `tauri.conf.json`:
   ```json
   "updater": {
     "active": true,
     "endpoints": [
       "https://github.com/<org>/watermonkey/releases/latest/download/latest.json"
     ],
     "dialog": true,
     "pubkey": "<the public key from step 4>"
   }
   ```
2. Use `tauri-apps/tauri-action` (the standard, maintained GitHub Action for
   this — do not hand-roll signing/notarization steps) in a release workflow
   separate from `.github/workflows/ci.yml`, triggered on a version tag, that
   builds signed bundles for macOS/Windows/Linux and publishes a GitHub
   Release with the `latest.json` manifest the updater endpoint above expects.
3. **Test the update path before shipping it to real users:** install an old
   signed build, publish a newer signed release, confirm the app detects and
   applies the update via `dialog: true`'s prompt — not just that the build
   succeeds. A working build pipeline and a working update path are different
   things to verify.

## Distribution channel

Direct download + this auto-updater, or an app store (Mac App Store /
Microsoft Store) — still an open decision (see MONETIZE.md). The Mac App
Store's sandboxing requirements are a real risk given this app's native
keychain access and `shell.open` usage; most comparable Tauri/Electron dev
tools use direct download for exactly this reason. Decide before the first
signed release, since it affects which of the steps above are even relevant
(app stores handle their own signing and don't use this updater mechanism).
