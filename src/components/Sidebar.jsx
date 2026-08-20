import React from 'react';
import Logo from './Logo';
import { History, LayoutDashboard, Monitor, Moon, Settings, ShieldCheck, Sun } from 'lucide-react';

const THEME_OPTIONS = [
  { id: 'system', label: 'System theme', icon: Monitor },
  { id: 'light', label: 'Light theme', icon: Sun },
  { id: 'dark', label: 'Dark theme', icon: Moon },
];

// Below `lg` (1024px) the sidebar collapses to an icon rail rather than
// disappearing — navigation must stay usable on narrower desktop windows
// (SPEC §6.13), and hiding it entirely would leave no way to switch tabs.
export default function Sidebar({ activeTab, setActiveTab, theme, setTheme }) {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'activity', label: 'Activity', icon: History },
    { id: 'settings', label: 'Connections', icon: Settings },
  ];

  return (
    <aside className="w-16 lg:w-60 bg-white/90 dark:bg-[#0c101c]/90 backdrop-blur-xl border-r border-slate-200/80 dark:border-white/[0.07] px-2 lg:px-4 py-6 flex flex-col justify-between shrink-0 transition-colors duration-300">
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-center lg:justify-start gap-3 px-0 lg:px-2 mb-10">
          <Logo className="w-9 h-9 shrink-0" />
          <div className="hidden lg:block">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Water Monkey
            </h1>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Cost intelligence
            </span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="space-y-2" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-center lg:justify-start gap-3 px-0 lg:px-3.5 py-3 rounded-xl text-xs font-mono uppercase tracking-wider transition-all duration-200 text-left ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="hidden lg:inline truncate">{item.label}</span>
                <span className="sr-only lg:hidden">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        {setTheme && (
          <div className="flex lg:flex-row flex-col items-center gap-1 justify-center lg:justify-start px-0 lg:px-1" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setTheme(option.id)}
                  aria-label={option.label}
                  aria-pressed={isActive}
                  title={option.label}
                  className={`p-2 rounded-lg transition ${isActive ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'}`}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        )}
        <div className="hidden lg:flex px-3.5 py-3 items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
          <span>Credentials secured</span>
        </div>
      </div>
    </aside>
  );
}
