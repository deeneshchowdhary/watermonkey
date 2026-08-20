import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { scanVercelWaste } from './vercelScanner';

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('scanVercelWaste', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing without a token, and never calls the network', async () => {
    await expect(scanVercelWaste('')).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('flags a project past the inactivity threshold and not one just under it', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: 'p1', name: 'stale-project', updatedAt: daysAgoIso(90) },
          { id: 'p2', name: 'fresh-project', updatedAt: daysAgoIso(10) },
        ],
      }),
    });

    const waste = await scanVercelWaste('token', { inactivityDays: 60, monthlyEstimate: 20 });
    expect(waste).toHaveLength(1);
    expect(waste[0].id).toBe('ver-p1');
    expect(waste[0].monthlyLoss).toBe(20);
    expect(waste[0].remediable).toBe(true);
    expect(waste[0].estimateBasis).toMatch(/60 days/);
  });

  it('honors a configurable threshold and estimate', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [{ id: 'p1', name: 'a', updatedAt: daysAgoIso(15) }] }),
    });

    const waste = await scanVercelWaste('token', { inactivityDays: 10, monthlyEstimate: 45 });
    expect(waste).toHaveLength(1);
    expect(waste[0].monthlyLoss).toBe(45);
  });

  it('throws when the API responds with an error, so the caller can isolate the failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, statusText: 'Unauthorized' });
    await expect(scanVercelWaste('bad-token')).rejects.toThrow();
  });
});
