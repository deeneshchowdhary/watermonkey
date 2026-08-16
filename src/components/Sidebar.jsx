import React from 'react';
import Logo from './Logo';
import { History, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'activity', label: 'Activity', icon: History },
    { id: 'settings', label: 'Connections', icon: Settings },
  ];

  return (
    <aside className="w-60 bg-white/90 dark:bg-[#0c101c]/90 backdrop-blur-xl border-r border-slate-200/80 dark:border-white/[0.07] px-4 py-6 flex flex-col justify-between shrink-0 transition-colors duration-300">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 mb-10">
          <Logo className="w-9 h-9" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Water Monkey
            </h1>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Cost intelligence
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-mono uppercase tracking-wider transition-all duration-200 text-left ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div>
        <div className="px-3.5 py-3 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
          <span>Credentials secured</span>
        </div>
      </div>
    </aside>
  );
}
