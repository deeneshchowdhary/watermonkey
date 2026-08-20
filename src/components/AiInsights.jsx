import React, { useEffect, useState } from 'react';
import { Bot, PlugZap, RefreshCw, Settings2, ShieldQuestion } from 'lucide-react';
import { generateAiSummary, checkOllamaAvailability, OLLAMA_DATA_DISCLOSURE } from '../lib/ollamaClient';
import { loadAiSettings, saveAiSettings } from '../lib/aiSettings';

export default function AiInsights({ wasteItems }) {
  const [settings, setSettings] = useState(loadAiSettings);
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    saveAiSettings(settings);
  }, [settings]);

  const refreshSummary = async () => {
    if (!wasteItems.length) {
      setSummary('No waste is currently available to analyze.');
      return;
    }
    setIsLoading(true);
    setSummary(await generateAiSummary(wasteItems, settings));
    setIsLoading(false);
  };

  useEffect(() => {
    if (!settings.autoRun) return;
    refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasteItems, settings.autoRun]);

  const testAvailability = async () => {
    setIsTesting(true);
    setAvailability(await checkOllamaAvailability(settings.endpoint, settings.model));
    setIsTesting(false);
  };

  return (
    <section className="bg-white dark:bg-white/[0.035] border border-slate-200 dark:border-white/[0.07] p-5 rounded-2xl mb-6">
      <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10"><Bot size={16} className="text-indigo-600 dark:text-indigo-400" /></span>
          <h3 className="text-sm font-semibold">AI recommendation</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Runs locally</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} aria-label="AI settings" className="text-slate-500 hover:text-indigo-500 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.05]" title="AI settings">
            <Settings2 size={15} />
          </button>
          {settings.autoRun ? (
            <button onClick={refreshSummary} disabled={isLoading} aria-label="Refresh AI summary" className="text-slate-500 hover:text-violet-500 disabled:opacity-50 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.05]" title="Refresh local AI summary">
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
          ) : null}
        </div>
      </div>

      {showSettings && (
        <div className="mb-4 p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] space-y-4">
          <p className="flex gap-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            <ShieldQuestion size={14} className="mt-0.5 shrink-0" />
            <span>{OLLAMA_DATA_DISCLOSURE}</span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Ollama endpoint</span>
              <input
                value={settings.endpoint}
                onChange={(e) => setSettings((s) => ({ ...s, endpoint: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/[0.1] rounded-lg text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Model</span>
              <input
                value={settings.model}
                onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-white/[0.03] border border-slate-300 dark:border-white/[0.1] rounded-lg text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={testAvailability} disabled={isTesting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-200 text-xs font-medium disabled:opacity-50">
              <PlugZap size={13} />
              <span>{isTesting ? 'Testing…' : 'Test availability'}</span>
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={settings.autoRun}
                onChange={(e) => setSettings((s) => ({ ...s, autoRun: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
              />
              <span>Automatically summarize after each scan</span>
            </label>
          </div>

          {availability && (
            <p className={`text-xs ${availability.available && !availability.modelMissing ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{availability.message}</p>
          )}
        </div>
      )}

      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {isLoading
          ? 'Asking the local Ollama model…'
          : settings.autoRun
            ? summary
            : summary || (
              <button onClick={refreshSummary} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                <RefreshCw size={13} />
                <span>Generate summary now</span>
              </button>
            )}
      </div>
    </section>
  );
}
