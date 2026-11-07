'use client';

import {
  AllCommunityModule,
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
} from 'ag-grid-community';

const isProduction = process.env.NODE_ENV === 'production';

ModuleRegistry.registerModules(
  isProduction ? [AllCommunityModule] : [AllCommunityModule, ValidationModule],
);

export const merchOpsTheme = themeQuartz.withParams({
  backgroundColor: 'var(--panel)',
  foregroundColor: 'var(--ink)',
  headerBackgroundColor: 'var(--paper)',
  headerTextColor: 'var(--ink-3)',
  headerCellHoverBackgroundColor: 'var(--rule)',
  borderColor: 'var(--rule)',
  rowHoverColor: 'var(--paper)',
  selectedRowBackgroundColor: 'var(--safe-field)',
  oddRowBackgroundColor: 'var(--panel)',
  inputBackgroundColor: 'var(--panel)',
  inputBorder: '1px solid var(--rule-strong)',
  inputTextColor: 'var(--ink)',
  accentColor: 'var(--focus)',
  borderRadius: 8,
  wrapperBorderRadius: 8,
  cellHorizontalPadding: 12,
});

export const noRowsOverlayTemplate =
  '<span class="text-xs text-ink-3 px-3">No records match the current filters.</span>';
