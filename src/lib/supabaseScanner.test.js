import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: (...args) => invokeMock(...args) }));

const { scanSupabaseWaste } = await import('./supabaseScanner');

describe('scanSupabaseWaste', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('returns nothing without a token, and never calls the backend', async () => {
    expect(await scanSupabaseWaste('')).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('flags INACTIVE and GOING_TO_PAUSE projects only', async () => {
    invokeMock.mockResolvedValue([
      { id: 'p1', name: 'idle', region: 'us-east-1', status: 'INACTIVE' },
      { id: 'p2', name: 'pausing', region: 'us-east-1', status: 'GOING_TO_PAUSE' },
      { id: 'p3', name: 'active', region: 'us-east-1', status: 'ACTIVE_HEALTHY' },
    ]);
    const waste = await scanSupabaseWaste('token');
    expect(waste.map((w) => w.id)).toEqual(['sup-p1', 'sup-p2']);
    expect(waste.every((w) => w.remediable === false)).toBe(true);
  });

  it('honors a configurable monthly estimate', async () => {
    invokeMock.mockResolvedValue([{ id: 'p1', name: 'idle', region: 'us-east-1', status: 'INACTIVE' }]);
    const waste = await scanSupabaseWaste('token', { monthlyEstimate: 40 });
    expect(waste[0].monthlyLoss).toBe(40);
  });

  it('wraps a backend error with a message', async () => {
    invokeMock.mockRejectedValue('Supabase Management API rejected the request (401)');
    await expect(scanSupabaseWaste('bad-token')).rejects.toThrow(/401/);
  });
});
