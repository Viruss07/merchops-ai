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
      label: 'Runway',
      ariaLabel: hasBreach ? `Runway, ${breachLabel}` : 'Runway, healthy',
      icon: TrendingUp,
      badge: hasBreach ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-blocked-field px-1.5 py-0.5 text-[10px] font-medium text-blocked">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {breachLabel}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-sm bg-safe-field px-1.5 py-0.5 text-[10px] font-medium text-safe">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Healthy
        </span>
      ),
    },
    {
      key: 'collections' as TabKey,
      label: 'Collections',
      ariaLabel: overdueCount > 0 ? `Collections, ${overdueCount} overdue` : 'Collections',
      icon: FileText,
      badge:
        overdueCount > 0 ? (
          <span className="rounded-sm bg-risk-field px-1.5 py-0.5 text-[10px] font-medium text-risk">
            {overdueCount} overdue
          </span>
        ) : null,
    },
    {
      key: 'payouts' as TabKey,
      label: 'Payouts',
      ariaLabel: pendingBillsCount > 0 ? `Payouts, ${pendingBillsCount} open` : 'Payouts',
      icon: Send,
      badge:
        pendingBillsCount > 0 ? (
          <span className="rounded-sm bg-rule px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
            {pendingBillsCount} open
          </span>
        ) : null,
    },
    {
      key: 'audit' as TabKey,
      label: 'Audit',
      ariaLabel: 'Audit',
      icon: History,
      badge: null,
    },
  ];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
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
    <nav aria-label="Financial modules" className="border-b border-rule bg-paper">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Financial modules"
          className="flex flex-wrap gap-x-5 sm:gap-x-8"
        >
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
                aria-label={tab.ariaLabel}
                aria-controls={`panel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChangeTab(tab.key)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`flex items-center gap-1.5 border-b-2 py-3 text-[13px] font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:text-sm ${
                  isActive
                    ? 'border-ink text-ink'
                    : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}
              >
                <Icon
                  className={`hidden h-3.5 w-3.5 sm:block ${isActive ? 'text-ink' : 'text-ink-3'}`}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                {tab.badge && <span className="hidden sm:inline-flex">{tab.badge}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
