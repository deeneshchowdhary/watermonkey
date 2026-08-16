import React, { useEffect, useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { generateAiSummary } from '../lib/ollamaClient';

export default function AiInsights({ wasteItems }) {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const refreshSummary = async () => {
    if (!wasteItems.length) {
      setSummary('No waste is currently available to analyze.');
      return;
    }
    setIsLoading(true);
    setSummary(await generateAiSummary(wasteItems));
    setIsLoading(false);
  };

  useEffect(() => {
    refreshSummary();
  }, [wasteItems]);

  return (
    <section className="bg-white dark:bg-white/[0.035] border border-slate-200 dark:border-white/[0.07] p-5 rounded-2xl mb-6">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10"><Bot size={16} className="text-indigo-600 dark:text-indigo-400" /></span>
          <h3 className="text-sm font-semibold">AI recommendation</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Runs locally</span>
        </div>
        <button onClick={refreshSummary} disabled={isLoading} className="text-slate-500 hover:text-violet-500 disabled:opacity-50" title="Refresh local AI summary">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {isLoading ? 'Asking the local Ollama model…' : summary}
      </div>
    </section>
  );
}
