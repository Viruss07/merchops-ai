'use client';

import React from 'react';
import { TrendingUp, FileText, Send, History, AlertCircle, CheckCircle2 } from 'lucide-react';

export type TabKey = 'runway' | 'collections' | 'payouts' | 'audit';

interface NavigationProps {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  overdueCount: number;
  pendingBillsCount: number;
  hasBreach: boolean;
  firstBreachDay?: number;
}

export function Navigation({
  activeTab,
  onChangeTab,
  overdueCount,
  pendingBillsCount,
  hasBreach,
  firstBreachDay,
}: NavigationProps) {
  const breachLabel =
    firstBreachDay === 0
      ? 'Breach at opening'
      : typeof firstBreachDay === 'number'
        ? `Breach Day ${firstBreachDay}`
        : 'Breach predicted';

  const tabs = [
    {
      key: 'runway' as TabKey,
      label: 'Runway & Forecast',
      icon: TrendingUp,
      badge: hasBreach ? (
        <span className="flex items-center space-x-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-3 w-3" />
          <span>{breachLabel}</span>
        </span>
      ) : (
        <span className="flex items-center space-x-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          <span>Healthy</span>
        </span>
      ),
    },
    {
      key: 'collections' as TabKey,
      label: 'Collections (AR)',
      icon: FileText,
      badge: overdueCount > 0 ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          {overdueCount} Overdue
        </span>
      ) : null,
    },
    {
      key: 'payouts' as TabKey,
      label: 'Payouts (AP)',
      icon: Send,
      badge: pendingBillsCount > 0 ? (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
          {pendingBillsCount} Open
        </span>
      ) : null,
    },
    {
      key: 'audit' as TabKey,
      label: 'Audit Trail',
      icon: History,
      badge: null,
    },
  ];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    const nextTab = tabs[nextIndex];
    onChangeTab(nextTab.key);
    document.getElementById(`tab-${nextTab.key}`)?.focus();
  };

  return (
    <nav aria-label="Financial modules" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div role="tablist" aria-label="Financial modules" className="flex space-x-8 overflow-x-auto py-1">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChangeTab(tab.key)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`flex items-center space-x-2 border-b-2 py-3.5 text-sm font-medium transition whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
