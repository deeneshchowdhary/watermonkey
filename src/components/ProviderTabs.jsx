import React from 'react';

export default function ProviderTabs({ selectedProvider, setSelectedProvider, wasteItems }) {
  const providers = ['ALL', 'AWS', 'GCP', 'Azure', 'Vercel', 'Supabase', 'OpenAI'];

  const getProviderCount = (prov) => {
    if (prov === 'ALL') return wasteItems.length;
    return wasteItems.filter((item) => item.provider === prov).length;
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {providers.map((prov) => {
          const count = getProviderCount(prov);
          const isSelected = selectedProvider === prov;
          return (
            <button
              key={prov}
              onClick={() => setSelectedProvider(prov)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
              }`}
            >
              <span>{prov}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
