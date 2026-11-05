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

// MerchOps AI modern theme definition via AG Grid Theming API (v33+)
export const merchOpsTheme = themeQuartz.withParams({
  headerBackgroundColor: '#f8fafc',
  headerTextColor: '#475569',
  headerCellHoverBackgroundColor: '#f1f5f9',
  borderColor: '#e2e8f0',
  rowHoverColor: '#f8fafc',
  selectedRowBackgroundColor: '#eff6ff',
  borderRadius: 12,
  wrapperBorderRadius: 12,
  cellHorizontalPadding: 12,
});

export const noRowsOverlayTemplate =
  '<span class="text-xs text-slate-500 px-3">No records match the current filters.</span>';
