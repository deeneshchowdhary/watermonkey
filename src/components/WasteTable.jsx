import React, { useState } from 'react';
import { Trash2, ShieldAlert } from 'lucide-react';

export default function WasteTable({ wasteItems, onKillResource }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cost findings</h3>
        <span className="text-xs text-slate-400">{wasteItems.length} flagged</span>
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/80 dark:bg-white/[0.025] text-slate-400 text-[11px] uppercase tracking-wide font-medium">
            <th className="p-4">Provider</th>
            <th className="p-4">Resource</th>
            <th className="p-4">Details</th>
            <th className="p-4">Monthly Loss</th>
            <th className="p-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-sm">
          {wasteItems.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.025] transition">
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
              <td className="p-4 text-slate-900 dark:text-white font-semibold">${item.monthlyLoss.toFixed(2)}<span className="text-slate-400 font-normal text-xs">/mo</span></td>
              <td className="p-4 text-right">
                <button
                  onClick={() => setSelectedItem(item)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-white/[0.06] hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg text-xs font-medium flex items-center gap-1.5 ml-auto transition"
                >
                  <Trash2 size={14} />
                  <span>{item.remediable === true ? 'Resolve' : 'Review'}</span>
                </button>
              </td>
            </tr>
          ))}
          {wasteItems.length === 0 && (
            <tr>
              <td colSpan="5" className="p-8 text-center text-slate-500">
                No active waste detected across your cloud fleet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Confirmation Dry-Run Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#111624] border border-slate-200 dark:border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-monkeyDanger mb-4">
              <ShieldAlert size={28} />
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Confirm action</h4>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              {selectedItem.remediable !== true
                ? 'This finding cannot be safely remediated automatically. Confirm to acknowledge and remove it from the current report.'
                : 'Are you sure you want to permanently delete this resource? This action will execute directly against your live cloud provider API.'}
            </p>

            <div className="bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-slate-200 dark:border-white/[0.07] text-xs mb-6 space-y-1">
              <div><span className="text-slate-500">Provider:</span> <span className="text-slate-900 dark:text-white">{selectedItem.provider}</span></div>
              <div><span className="text-slate-500">Resource:</span> <span className="text-slate-900 dark:text-white">{selectedItem.resource}</span></div>
              <div><span className="text-slate-500">Target ID:</span> <span className="text-amber-400">{selectedItem.id}</span></div>
            </div>

            {deleteError && <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs">{deleteError}</div>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setSelectedItem(null); setDeleteError(''); }}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 font-medium rounded-lg text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-monkeyDanger hover:bg-red-600 text-white font-bold rounded-lg text-sm flex items-center gap-2 transition"
              >
                {isDeleting ? "Working..." : selectedItem.remediable === true ? "Confirm Termination" : "Acknowledge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
