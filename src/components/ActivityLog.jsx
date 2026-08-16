import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, History, Search, ShieldCheck, Trash2 } from 'lucide-react';

const eventStyles = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  warning: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  info: { icon: Clock3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
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
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Completed scans', value: scans, icon: History, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Resources resolved', value: remediations, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Needs attention', value: failures, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`rounded-xl p-2.5 ${bg} ${color}`}><Icon size={19} /></span>
            <div><div className="text-2xl font-semibold text-slate-950">{value}</div><div className="text-xs text-slate-600">{label}</div></div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-[260px]">
            <Search size={15} className="text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-500 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            {['all', 'scan', 'remediation'].map((type) => (
              <button key={type} onClick={() => setFilter(type)} className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${filter === type ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{type}</button>
            ))}
            {events.length > 0 && <button onClick={onClear} className="ml-2 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Clear activity history"><Trash2 size={15} /></button>}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleEvents.map((event) => {
            const style = eventStyles[event.status] || eventStyles.info;
            const Icon = style.icon;
            return (
              <article key={event.id} className="flex gap-4 p-5 hover:bg-slate-50/70">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.color}`}><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{event.title}</h3>
                    {event.provider && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{event.provider}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{event.message}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
              </article>
            );
          })}
          {visibleEvents.length === 0 && (
            <div className="px-6 py-16 text-center"><History size={24} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-medium text-slate-700">No activity yet</p><p className="mt-1 text-xs text-slate-500">Run a cloud scan to create your first entry.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
