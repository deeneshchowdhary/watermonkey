import React from 'react';

export default function WasteDistribution({ wasteItems }) {
  const totalLoss = wasteItems.reduce((acc, item) => acc + item.monthlyLoss, 0);
  if (totalLoss === 0) return null;

  const providerColors = {
    AWS: 'bg-amber-500',
    GCP: 'bg-emerald-500',
    Azure: 'bg-blue-500',
    Vercel: 'bg-indigo-500',
    Supabase: 'bg-teal-500',
    OpenAI: 'bg-violet-500'
  };

  const totalsByProvider = wasteItems.reduce((acc, item) => {
    acc[item.provider] = (acc[item.provider] || 0) + item.monthlyLoss;
    return acc;
  }, {});

  return (
    <div className="bg-white dark:bg-white/[0.035] border border-slate-200 dark:border-white/[0.07] p-5 rounded-2xl mb-6">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          Cost distribution
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          ${totalLoss.toFixed(2)}/mo total
        </span>
      </div>

      {/* Segmented Bar Chart */}
      <div className="h-2 w-full bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden flex gap-px">
        {Object.entries(totalsByProvider).map(([provider, amount]) => {
          const pct = ((amount / totalLoss) * 100).toFixed(1);
          return (
            <div
              key={provider}
              style={{ width: `${pct}%` }}
              className={`h-full ${providerColors[provider] || 'bg-cyan-500'} transition-all duration-500`}
              title={`${provider}: $${amount.toFixed(2)} (${pct}%)`}
            />
          );
        })}
      </div>

      {/* Legend with High-Contrast Text */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-[11px]">
        {Object.entries(totalsByProvider).map(([provider, amount]) => (
          <div key={provider} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${providerColors[provider] || 'bg-cyan-500'}`}></span>
            <span className="text-slate-700 dark:text-slate-300 font-medium">{provider}</span>
            <span className="text-slate-400 dark:text-slate-500">${amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
