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
}

export function Navigation({
  activeTab,
  onChangeTab,
  overdueCount,
  pendingBillsCount,
  hasBreach,
}: NavigationProps) {
  const tabs = [
    {
      key: 'runway' as TabKey,
      label: 'Runway & Forecast',
      icon: TrendingUp,
      badge: hasBreach ? (
        <span className="flex items-center space-x-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-3 w-3" />
          <span>Breach Day 10</span>
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
          {pendingBillsCount} Pending
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

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8 overflow-x-auto py-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onChangeTab(tab.key)}
                className={`flex items-center space-x-2 border-b-2 py-3.5 text-sm font-medium transition whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
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

