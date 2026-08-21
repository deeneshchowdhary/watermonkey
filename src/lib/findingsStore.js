// Persisted finding lifecycle (SPEC §6.8).
//
// Every finding a scan has ever surfaced is kept as a "record" with a
// status, rather than the previous model where a finding simply vanished
// once removed from an in-memory array. Statuses:
//
//   open        - currently reported by the provider, not yet actioned
//   reopened    - was missing or resolved, and has reappeared
//   acknowledged- user dismissed a review-only (non-remediable) finding;
//                 persists across scans (see decision note in MONETIZE-
//                 adjacent SPEC §12.4 — acknowledgement is persistent, not
//                 per-scan, in this implementation)
//   resolved    - remediation succeeded through the app
//   missing     - was open/acknowledged/reopened, and the provider no
//                 longer reports it (deleted outside the app, or the
//                 condition cleared on its own) — inferred, not confirmed
//
// "Active" (open + reopened) is what the dashboard and default table view
// show; the rest stays in history rather than being silently dropped.

import { loadVersioned, saveVersioned } from './versionedStorage';

const STORAGE_KEY = 'watermonkey-report';
const MAX_RECORDS = 500;

// Schema versioning (SPEC §9). Version 0 is the original unwrapped
// `{records, lastScanAt}` shape written before this schema existed — it's
// already structurally compatible with v1, so its migration is the
// identity function; the version wrapper itself is handled by
// `loadVersioned`. Add a `1: (data) => ({...})` entry here the next time
// the record shape changes.
const SCHEMA_VERSION = 1;
const MIGRATIONS = {
  0: (data) => data,
};

function recordKey(record) {
  return `${record.provider}::${record.id}`;
}

export function loadReport() {
  const data = loadVersioned(STORAGE_KEY, SCHEMA_VERSION, MIGRATIONS, { records: [], lastScanAt: null });
  return {
    records: Array.isArray(data.records) ? data.records : [],
    lastScanAt: data.lastScanAt || null,
  };
}

export function saveReport(report) {
  // Bounded persistence (SPEC §7.3): every record still needing attention
  // (open/acknowledged/reopened) is kept; only resolved/missing history is
  // trimmed, oldest first, once the total exceeds MAX_RECORDS.
  const active = report.records.filter((r) => r.status !== 'resolved' && r.status !== 'missing');
  const inactive = report.records
    .filter((r) => r.status === 'resolved' || r.status === 'missing')
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  const keepInactive = inactive.slice(0, Math.max(0, MAX_RECORDS - active.length));
  const bounded = { ...report, records: [...active, ...keepInactive] };
  saveVersioned(STORAGE_KEY, SCHEMA_VERSION, bounded);
  return bounded;
}

/**
 * Merges fresh scan results into the persisted record set.
 *
 * resultsByProvider: { [provider]: { status: 'succeeded'|'failed'|'skipped', findings: WasteFinding[] } }
 *
 * A provider whose scan did not succeed this round (failed or skipped) is
 * left completely untouched — an outage or a not-yet-configured provider
 * must never appear to resolve or lose that provider's earlier findings.
 */
export function reconcile(previousRecords, resultsByProvider, now) {
  const previousByKey = new Map(previousRecords.map((r) => [recordKey(r), r]));
  const next = [];

  for (const [provider, result] of Object.entries(resultsByProvider)) {
    if (result.status !== 'succeeded') continue;
    const freshByKey = new Map((result.findings || []).map((f) => [recordKey(f), f]));

    for (const [key, finding] of freshByKey) {
      const previous = previousByKey.get(key);
      if (!previous) {
        next.push({ ...finding, status: 'open', firstSeenAt: now, lastSeenAt: now });
      } else {
        // A finding that reappears after being missing or resolved needs a
        // fresh look; acknowledged/open/reopened simply carries forward.
        const status = previous.status === 'missing' || previous.status === 'resolved' ? 'reopened' : previous.status;
        next.push({ ...finding, status, firstSeenAt: previous.firstSeenAt, lastSeenAt: now });
      }
    }

    for (const [key, previous] of previousByKey) {
      if (previous.provider !== provider || freshByKey.has(key)) continue;
      if (previous.status === 'resolved' || previous.status === 'missing') {
        next.push(previous);
      } else {
        next.push({ ...previous, status: 'missing' });
      }
    }
  }

  for (const [key, previous] of previousByKey) {
    const touched = resultsByProvider[previous.provider]?.status === 'succeeded';
    if (touched) continue; // already handled above
    next.push(previous);
  }

  return next;
}

export function activeRecords(records) {
  return records.filter((r) => r.status === 'open' || r.status === 'reopened');
}

export function markAcknowledged(records, provider, id, timestamp) {
  return records.map((r) => (r.provider === provider && r.id === id ? { ...r, status: 'acknowledged', acknowledgedAt: timestamp } : r));
}

export function markResolved(records, provider, id, timestamp) {
  return records.map((r) => (r.provider === provider && r.id === id ? { ...r, status: 'resolved', resolvedAt: timestamp } : r));
}
