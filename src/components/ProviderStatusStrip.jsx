import React from 'react';
import { AlertTriangle, Check, Circle, Loader2, RotateCcw, SkipForward } from 'lucide-react';

const STATE_META = {
  idle: { label: 'Not scanned yet', icon: Circle, className: 'text-slate-400' },
  scanning: { label: 'Scanning…', icon: Loader2, className: 'text-indigo-500', spin: true },
  succeeded: { label: 'Succeeded', icon: Check, className: 'text-emerald-600' },
  failed: { label: 'Failed', icon: AlertTriangle, className: 'text-red-600' },
  skipped: { label: 'Skipped (not configured)', icon: SkipForward, className: 'text-slate-400' },
};

/**
 * Per-provider scan status (SPEC §6.7): idle/skipped/scanning/succeeded/
 * failed instead of a single fleet-level message, with independent retry
 * for a failed provider. Status is communicated by icon + text together,
 * never color alone (SPEC §7.4).
 */
export default function ProviderStatusStrip({ providerStatus, onRetry, isScanning }) {
  return (
    <div className="mb-6 bg-white dark:bg-white/[0.035] border border-slate-200 dark:border-white/[0.07] rounded-2xl p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {Object.entries(providerStatus).map(([provider, { state, message }]) => {
          const meta = STATE_META[state] || STATE_META.idle;
          const Icon = meta.icon;
          return (
            <div key={provider} className="flex items-center gap-2 min-w-0">
              <Icon size={14} className={`shrink-0 ${meta.className} ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{provider}</span>
              <span className={`text-xs ${meta.className}`} title={message || undefined}>{meta.label}</span>
              {state === 'failed' && (
                <button
                  type="button"
                  onClick={() => onRetry(provider)}
                  disabled={isScanning}
                  aria-label={`Retry ${provider} scan`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-50 transition"
                >
                  <RotateCcw size={11} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
