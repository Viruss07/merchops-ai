/**
 * Verification script to verify Runway 30-Day Trajectory chart renders with non-zero bar dimensions
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3005';

async function verifyChart() {
  console.log(`[VERIFY] Fetching dashboard HTML from ${BASE_URL}...`);
  const res = await fetch(`${BASE_URL}/`);
  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard: HTTP ${res.status}`);
  }
  const html = await res.text();

  // 1. Check for 30-day grid definition
  const hasGridDefinition = html.includes('grid-template-columns:repeat(30, minmax(0, 1fr))') || html.includes('grid-template-columns: repeat(30, minmax(0, 1fr))');
  console.log(`[VERIFY] 1. 30-column grid template present: ${hasGridDefinition}`);
  if (!hasGridDefinition) {
    throw new Error('Failed: 30-column grid template not found in rendered HTML');
  }

  // 2. Check for Day 1-9 bar heights (112px for $4,200 balance)
  const has112pxBar = html.includes('height:112px') || html.includes('height: 112px');
  console.log(`[VERIFY] 2. Safe balance 112px bars present: ${has112pxBar}`);
  if (!has112pxBar) {
    throw new Error('Failed: 112px bar height not found');
  }

  // 3. Check for Day 10 bar height (32px for $1,200 balance)
  const has32pxBar = html.includes('height:32px') || html.includes('height: 32px');
  console.log(`[VERIFY] 3. Day 10 breach 32px bar present: ${has32pxBar}`);
  if (!has32pxBar) {
    throw new Error('Failed: 32px bar height not found');
  }

  // 4. Check for safe and breach color classes
  const hasBlueBar = html.includes('bg-blue-500');
  const hasRoseBar = html.includes('bg-rose-500');
  console.log(`[VERIFY] 4. Safe blue bars present: ${hasBlueBar}, Breach red bars present: ${hasRoseBar}`);
  if (!hasBlueBar || !hasRoseBar) {
    throw new Error('Failed: Bar color classes not found');
  }

  // 5. Check for Day 10 indicator marker
  const hasDay10Marker = html.includes('▼ 10');
  console.log(`[VERIFY] 5. Day 10 marker present: ${hasDay10Marker}`);
  if (!hasDay10Marker) {
    throw new Error('Failed: Day 10 marker not found');
  }

  // 6. Check for AG Grid integration
  const hasAgTheme = html.includes('ag-theme-quartz');
  console.log(`[VERIFY] 6. AG Grid Theme (ag-theme-quartz) present: ${hasAgTheme}`);
  if (!hasAgTheme) {
    throw new Error('Failed: ag-theme-quartz not found');
  }

  console.log('[VERIFY] ALL RUNWAY CHART & AG GRID RENDER CHECKS PASSED SUCCESSFULLY!');
}

verifyChart().catch((err) => {
  console.error('[VERIFY ERROR]', err);
  process.exit(1);
});

