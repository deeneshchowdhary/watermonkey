import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { scanOpenAiWaste } from './openaiScanner';

function bucket(startTime, amount) {
  return { start_time: startTime, results: [{ amount: { value: amount } }] };
}

describe('scanOpenAiWaste', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing without an admin key', async () => {
    expect(await scanOpenAiWaste('')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('flags a spike at or above the multiplier', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [bucket(1, 10), bucket(2, 10), bucket(3, 10), bucket(4, 30)], // baseline 10, latest 30 = 3x
      }),
    });
    const waste = await scanOpenAiWaste('key', { days: 4, spikeMultiplier: 2 });
    expect(waste).toHaveLength(1);
    expect(waste[0].monthlyLoss).toBe(Number(((30 - 10) * 30).toFixed(2)));
    expect(waste[0].remediable).toBe(false);
  });

  it('does not flag spend under the multiplier', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [bucket(1, 10), bucket(2, 10), bucket(3, 15)] }), // 15 < 10*2
    });
    const waste = await scanOpenAiWaste('key', { days: 3, spikeMultiplier: 2 });
    expect(waste).toEqual([]);
  });

  it('throws with a clear message on a non-ok response', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(scanOpenAiWaste('bad-key')).rejects.toThrow(/401/);
  });
});
