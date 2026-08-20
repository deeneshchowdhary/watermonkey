import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Info, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { SEVERITY_ORDER } from '../lib/severity';
import { useDialogA11y } from '../lib/useDialogA11y';
import { openExternal, supabaseProjectUrl } from '../lib/externalLinks';

const STATUS_META = {
  open: { label: 'Open', className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' },
  reopened: { label: 'Reopened', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  acknowledged: { label: 'Acknowledged', className: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300' },
  resolved: { label: 'Resolved', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  missing: { label: 'Missing', className: 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400' },
};

const SEVERITY_META = {
  High: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  Medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  Low: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300',
};

const STATUS_FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'missing', label: 'Missing' },
  { id: 'all', label: 'All' },
];

const SORT_OPTIONS = [
  { id: 'monthlyLoss', label: 'Monthly loss' },
  { id: 'severity', label: 'Severity' },
  { id: 'provider', label: 'Provider' },
  { id: 'resource', label: 'Resource' },
];

function matchesStatusFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'active') return item.status === 'open' || item.status === 'reopened';
  return item.status === filter;
}

function compareItems(a, b, sortBy, direction) {
  let result;
  if (sortBy === 'severity') {
    result = (SEVERITY_ORDER[a.severity] || 0) - (SEVERITY_ORDER[b.severity] || 0);
  } else if (sortBy === 'monthlyLoss') {
    result = a.monthlyLoss - b.monthlyLoss;
  } else {
    result = String(a[sortBy] || '').localeCompare(String(b[sortBy] || ''));
  }
  return direction === 'asc' ? result : -result;
}

export default function WasteTable({ wasteItems, onKillResource }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortBy, setSortBy] = useState('monthlyLoss');
  const [sortDirection, setSortDirection] = useState('desc');

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return wasteItems
      .filter((item) => matchesStatusFilter(item, statusFilter))
      .filter((item) => !q || [item.provider, item.resource, item.details, item.id].some((field) => String(field || '').toLowerCase().includes(q)))
      .sort((a, b) => compareItems(a, b, sortBy, sortDirection));
  }, [wasteItems, query, statusFilter, sortBy, sortDirection]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedItem) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onKillResource(selectedItem);
      setSelectedItem(null);
    } catch (error) {
      setDeleteError(error.message || String(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-white/[0.035] rounded-2xl border border-slate-200 dark:border-white/[0.07] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cost findings</h3>
          <span className="text-xs text-slate-400">{visibleItems.length} shown</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.03] px-3 py-2 min-w-[200px] flex-1">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search provider, resource, details, or ID"
              aria-label="Search findings"
              className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                aria-pressed={statusFilter === filter.id}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition ${statusFilter === filter.id ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
            Sort by
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 text-[11px] outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              {SORT_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
            <button
              onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              {sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
            </button>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-white/[0.025] text-slate-400 text-[11px] uppercase tracking-wide font-medium">
              <SortableHeader label="Provider" field="provider" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
              <th className="p-4">Resource</th>
              <th className="p-4">Details</th>
              <SortableHeader label="Severity" field="severity" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
              <SortableHeader label="Monthly Loss" field="monthlyLoss" sortBy={sortBy} sortDirection={sortDirection} onSort={toggleSort} />
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-sm">
            {visibleItems.map((item) => {
              const canAct = item.status === 'open' || item.status === 'reopened';
              const statusMeta = STATUS_META[item.status] || STATUS_META.open;
              return (
                <tr key={`${item.provider}-${item.id}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.025] transition">
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      item.provider === 'AWS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      item.provider === 'Vercel' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {item.provider}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-900 dark:text-slate-100">{item.resource}</td>
                  <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">{item.details}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SEVERITY_META[item.severity] || SEVERITY_META.Low}`}>{item.severity}</span>
                  </td>
                  <td className="p-4 text-slate-900 dark:text-white font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      ${item.monthlyLoss.toFixed(2)}<span className="text-slate-400 font-normal text-xs">/mo est.</span>
                      {item.estimateBasis && (
                        <button type="button" title={item.estimateBasis} aria-label={`How this estimate was calculated: ${item.estimateBasis}`} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/40">
                          <Info size={12} />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusMeta.className}`}>{statusMeta.label}</span>
                  </td>
                  <td className="p-4 text-right">
                    {canAct ? (
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-white/[0.06] hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg text-xs font-medium flex items-center gap-1.5 ml-auto transition"
                      >
                        <Trash2 size={14} />
                        <span>{item.remediable === true ? 'Resolve' : 'Review'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-500">
                  {wasteItems.length === 0 ? 'No active waste detected across your cloud fleet.' : 'No findings match the current search and filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <ConfirmDialog
          item={selectedItem}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onCancel={() => { setSelectedItem(null); setDeleteError(''); }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

function SortableHeader({ label, field, sortBy, sortDirection, onSort }) {
  const isActive = sortBy === field;
  const Icon = isActive ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="p-4">
      <button onClick={() => onSort(field)} className={`flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 ${isActive ? 'text-slate-700 dark:text-slate-200' : ''}`}>
        <span>{label}</span>
        <Icon size={11} />
      </button>
    </th>
  );
}

function ConfirmDialog({ item, isDeleting, deleteError, onCancel, onConfirm }) {
  const dialogRef = useDialogA11y(true, onCancel);

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" className="bg-white dark:bg-[#111624] border border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl outline-none">
        <div className="flex items-center gap-3 text-monkeyDanger mb-4">
          <ShieldAlert size={28} />
          <h4 id="confirm-action-title" className="text-lg font-semibold text-slate-900 dark:text-white">Confirm action</h4>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
          {item.remediable !== true
            ? 'This finding cannot be safely remediated automatically. Confirm to acknowledge it — it stays in your history and can be filtered back in at any time.'
            : 'Are you sure you want to permanently delete this resource? This action will execute directly against your live cloud provider API.'}
        </p>

        {item.provider === 'Supabase' && (
          <button
            type="button"
            onClick={() => openExternal(supabaseProjectUrl(item.id))}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-200 text-sm font-medium transition"
          >
            <ExternalLink size={14} />
            <span>Open project in Supabase dashboard</span>
          </button>
        )}

        <div className="bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-slate-200 dark:border-white/[0.07] text-xs mb-6 space-y-1">
          <div><span className="text-slate-500">Provider:</span> <span className="text-slate-900 dark:text-white">{item.provider}</span></div>
          <div><span className="text-slate-500">Resource:</span> <span className="text-slate-900 dark:text-white">{item.resource}</span></div>
          <div><span className="text-slate-500">Target ID:</span> <span className="text-amber-500 dark:text-amber-400">{item.id}</span></div>
        </div>

        {deleteError && <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 text-xs">{deleteError}</div>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 font-medium rounded-lg text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-monkeyDanger hover:bg-red-600 text-white font-bold rounded-lg text-sm flex items-center gap-2 transition"
          >
            {isDeleting ? "Working..." : item.remediable === true ? "Confirm Termination" : "Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}
