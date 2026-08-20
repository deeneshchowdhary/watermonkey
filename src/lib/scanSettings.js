import { DEFAULT_AWS_PRICING } from './awsScanner';
import { DEFAULT_VERCEL_SETTINGS } from './vercelScanner';
import { DEFAULT_SUPABASE_SETTINGS } from './supabaseScanner';
import { DEFAULT_OPENAI_SETTINGS } from './openaiScanner';
import { GCP_ZONES } from './gcpScanner';

const STORAGE_KEY = 'watermonkey-scan-settings';

export const DEFAULT_SCAN_SETTINGS = {
  aws: { regions: ['us-east-1'], ...DEFAULT_AWS_PRICING },
  vercel: { ...DEFAULT_VERCEL_SETTINGS },
  supabase: { ...DEFAULT_SUPABASE_SETTINGS },
  openai: { ...DEFAULT_OPENAI_SETTINGS },
  gcp: { zones: GCP_ZONES.map((z) => z.id) },
};

// Scan scope and pricing assumptions are local configuration, not secrets,
// so they live in localStorage alongside activity history rather than the
// OS keychain.
export function loadScanSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      aws: { ...DEFAULT_SCAN_SETTINGS.aws, ...stored.aws },
      vercel: { ...DEFAULT_SCAN_SETTINGS.vercel, ...stored.vercel },
      supabase: { ...DEFAULT_SCAN_SETTINGS.supabase, ...stored.supabase },
      openai: { ...DEFAULT_SCAN_SETTINGS.openai, ...stored.openai },
      gcp: { ...DEFAULT_SCAN_SETTINGS.gcp, ...stored.gcp },
    };
  } catch {
    return DEFAULT_SCAN_SETTINGS;
  }
}

export function saveScanSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
