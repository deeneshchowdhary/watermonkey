import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, History, Search, ShieldCheck, Trash2 } from 'lucide-react';

const eventStyles = {
  success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  warning: { icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  error: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10' },
  info: { icon: Clock3, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
};

export default function ActivityLog({ events, onClear }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesType = filter === 'all' || event.category === filter;
    const haystack = `${event.title} ${event.message} ${event.provider || ''}`.toLowerCase();
    return matchesType && haystack.includes(query.toLowerCase());
  }), [events, filter, query]);

  const scans = events.filter((event) => event.category === 'scan' && event.status !== 'info').length;
  const remediations = events.filter((event) => event.category === 'remediation' && event.status === 'success').length;
  const failures = events.filter((event) => event.status === 'error' || event.status === 'warning').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Completed scans', value: scans, icon: History, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
          { label: 'Resources resolved', value: remediations, icon: ShieldCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Needs attention', value: failures, icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.035] p-5 shadow-sm">
            <span className={`rounded-xl p-2.5 ${bg} ${color}`}><Icon size={19} /></span>
            <div><div className="text-2xl font-semibold text-slate-950 dark:text-white">{value}</div><div className="text-xs text-slate-600 dark:text-slate-400">{label}</div></div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.035] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.07] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.03] px-3 py-2 sm:min-w-[220px]">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-500 outline-none" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {['all', 'scan', 'remediation', 'credential'].map((type) => (
              <button key={type} onClick={() => setFilter(type)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${filter === type ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}>{type}</button>
            ))}
            {events.length > 0 && <button onClick={onClear} className="ml-2 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" title="Clear activity history" aria-label="Clear activity history"><Trash2 size={15} /></button>}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {visibleEvents.map((event) => {
            const style = eventStyles[event.status] || eventStyles.info;
            const Icon = style.icon;
            return (
              <article key={event.id} className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-5 hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.color}`}><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{event.title}</h3>
                    {event.provider && <span className="rounded bg-slate-100 dark:bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">{event.provider}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{event.message}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-500 dark:text-slate-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
              </article>
            );
          })}
          {visibleEvents.length === 0 && (
            <div className="px-6 py-16 text-center"><History size={24} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" /><p className="text-sm font-medium text-slate-700 dark:text-slate-300">No activity yet</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Run a cloud scan to create your first entry.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
