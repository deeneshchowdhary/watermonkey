import { describe, expect, it, beforeEach } from 'vitest';
import { loadScanSettings, saveScanSettings, DEFAULT_SCAN_SETTINGS } from './scanSettings';

describe('scanSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns documented defaults when nothing is stored', () => {
    expect(loadScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
  });

  it('merges a partial stored override on top of defaults, per provider', () => {
    saveScanSettings({ aws: { regions: ['us-west-2', 'eu-west-1'], ebsPricePerGbMonth: 0.08 } });
    const loaded = loadScanSettings();
    expect(loaded.aws.regions).toEqual(['us-west-2', 'eu-west-1']);
    expect(loaded.aws.ebsPricePerGbMonth).toBe(0.08);
    // untouched sibling field keeps its default
    expect(loaded.aws.elasticIpPricePerMonth).toBe(DEFAULT_SCAN_SETTINGS.aws.elasticIpPricePerMonth);
    // untouched providers keep their full defaults
    expect(loaded.vercel).toEqual(DEFAULT_SCAN_SETTINGS.vercel);
    expect(loaded.gcp).toEqual(DEFAULT_SCAN_SETTINGS.gcp);
  });

  it('falls back to defaults if storage is corrupt', () => {
    localStorage.setItem('watermonkey-scan-settings', '{not json');
    expect(loadScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
  });
});
