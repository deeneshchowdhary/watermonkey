import { describe, expect, it, beforeEach } from 'vitest';
import { reconcile, activeRecords, markAcknowledged, markResolved, loadReport, saveReport } from './findingsStore';

function find(records, provider, id) {
  return records.find((r) => r.provider === provider && r.id === id);
}

describe('reconcile', () => {
  it('marks a brand new finding as open', () => {
    const next = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't1');
    expect(find(next, 'AWS', 'vol-1').status).toBe('open');
  });

  it('marks a previously open finding missing when it disappears from a successful scan', () => {
    const r1 = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }, { provider: 'AWS', id: 'vol-2', monthlyLoss: 3 }] } }, 't1');
    const r2 = reconcile(r1, { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't2');
    expect(find(r2, 'AWS', 'vol-1').status).toBe('open');
    expect(find(r2, 'AWS', 'vol-2').status).toBe('missing');
  });

  it('leaves a provider entirely untouched when its scan failed, even for previously missing/open records', () => {
    const r1 = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't1');
    const r2 = reconcile(r1, { AWS: { status: 'succeeded', findings: [] } }, 't2'); // vol-1 -> missing
    const r3 = reconcile(r2, { AWS: { status: 'failed', findings: [] } }, 't3');
    expect(find(r3, 'AWS', 'vol-1').status).toBe('missing');
    expect(r3).toHaveLength(1);
  });

  it('leaves a skipped provider untouched too', () => {
    const r1 = reconcile([], { Vercel: { status: 'succeeded', findings: [{ provider: 'Vercel', id: 'ver-1', monthlyLoss: 20 }] } }, 't1');
    const r2 = reconcile(r1, { Vercel: { status: 'skipped', findings: [] } }, 't2');
    expect(find(r2, 'Vercel', 'ver-1').status).toBe('open');
  });

  it('keeps an acknowledged finding acknowledged when it reappears', () => {
    let r = reconcile([], { Supabase: { status: 'succeeded', findings: [{ provider: 'Supabase', id: 'sup-1', monthlyLoss: 25 }] } }, 't1');
    r = markAcknowledged(r, 'Supabase', 'sup-1', 't1');
    r = reconcile(r, { Supabase: { status: 'succeeded', findings: [{ provider: 'Supabase', id: 'sup-1', monthlyLoss: 25 }] } }, 't2');
    expect(find(r, 'Supabase', 'sup-1').status).toBe('acknowledged');
  });

  it('reopens a finding that was missing and comes back', () => {
    let r = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't1');
    r = reconcile(r, { AWS: { status: 'succeeded', findings: [] } }, 't2'); // missing
    r = reconcile(r, { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't3');
    expect(find(r, 'AWS', 'vol-1').status).toBe('reopened');
  });

  it('reopens a resolved finding that reappears, rather than silently re-resolving it', () => {
    let r = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't1');
    r = markResolved(r, 'AWS', 'vol-1', 't1');
    r = reconcile(r, { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't2');
    expect(find(r, 'AWS', 'vol-1').status).toBe('reopened');
  });

  it('keeps a resolved finding resolved when it stays absent (no regression to missing)', () => {
    let r = reconcile([], { AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'vol-1', monthlyLoss: 5 }] } }, 't1');
    r = markResolved(r, 'AWS', 'vol-1', 't1');
    r = reconcile(r, { AWS: { status: 'succeeded', findings: [] } }, 't2');
    expect(find(r, 'AWS', 'vol-1').status).toBe('resolved');
  });

  it('does not cross-contaminate records between providers with the same finding id', () => {
    const r = reconcile([], {
      AWS: { status: 'succeeded', findings: [{ provider: 'AWS', id: 'same-id', monthlyLoss: 5 }] },
      GCP: { status: 'succeeded', findings: [{ provider: 'GCP', id: 'same-id', monthlyLoss: 9 }] },
    }, 't1');
    expect(r).toHaveLength(2);
    expect(find(r, 'AWS', 'same-id').monthlyLoss).toBe(5);
    expect(find(r, 'GCP', 'same-id').monthlyLoss).toBe(9);
  });
});

describe('activeRecords', () => {
  it('includes only open and reopened records', () => {
    const records = [
      { provider: 'A', id: '1', status: 'open' },
      { provider: 'A', id: '2', status: 'reopened' },
      { provider: 'A', id: '3', status: 'acknowledged' },
      { provider: 'A', id: '4', status: 'resolved' },
      { provider: 'A', id: '5', status: 'missing' },
    ];
    expect(activeRecords(records).map((r) => r.id)).toEqual(['1', '2']);
  });
});

describe('loadReport / saveReport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips through localStorage', () => {
    const report = { records: [{ provider: 'AWS', id: 'vol-1', status: 'open', monthlyLoss: 5, lastSeenAt: 't1' }], lastScanAt: 't1' };
    saveReport(report);
    const loaded = loadReport();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.lastScanAt).toBe('t1');
  });

  it('returns an empty report when storage is empty or corrupt', () => {
    expect(loadReport()).toEqual({ records: [], lastScanAt: null });
    localStorage.setItem('watermonkey-report', 'not json');
    expect(loadReport()).toEqual({ records: [], lastScanAt: null });
  });

  it('reads pre-versioning data written by an older build without losing anything', () => {
    // The shape used before schema versioning (§9) was introduced: a bare
    // {records, lastScanAt} object with no version wrapper at all.
    localStorage.setItem('watermonkey-report', JSON.stringify({
      records: [{ provider: 'AWS', id: 'vol-1', status: 'open', monthlyLoss: 5, lastSeenAt: 't1' }],
      lastScanAt: 't1',
    }));
    const loaded = loadReport();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].id).toBe('vol-1');
  });

  it('bounds resolved/missing history but never trims active records', () => {
    const active = Array.from({ length: 10 }, (_, i) => ({ provider: 'AWS', id: `open-${i}`, status: 'open', lastSeenAt: 't1' }));
    const inactive = Array.from({ length: 600 }, (_, i) => ({ provider: 'AWS', id: `old-${i}`, status: 'resolved', lastSeenAt: `t${i}` }));
    const saved = saveReport({ records: [...active, ...inactive], lastScanAt: 't1' });
    const openCount = saved.records.filter((r) => r.status === 'open').length;
    expect(openCount).toBe(10);
    expect(saved.records.length).toBeLessThanOrEqual(500);
  });
});
