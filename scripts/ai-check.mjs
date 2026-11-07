#!/usr/bin/env node
/**
 * OpenRouter AI Models & Connectivity Diagnostic
 *
 * Verifies OpenRouter connectivity, lists active :free models, and tests inference latency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

async function main() {
  console.log('=== OpenRouter AI Health Diagnostic ===');
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Step 1: Query free models from OpenRouter catalog
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (res.ok) {
      const data = await res.json();
      const freeModels = (data.data || [])
        .map((m) => m.id)
        .filter((id) => id && id.endsWith(':free'));
      console.log(`[PASS] OpenRouter catalog reachable. Found ${freeModels.length} free models:`);
      for (const m of freeModels.slice(0, 8)) {
        console.log(`  - ${m}`);
      }
      if (freeModels.length > 8) console.log(`  ... and ${freeModels.length - 8} more.`);
    } else {
      console.log(`[WARN] Catalog lookup HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`[WARN] Catalog lookup failed: ${err.message}`);
  }

  // Step 2: Check API Key
  if (!apiKey || apiKey.startsWith('your_')) {
    console.log('[INFO] OPENROUTER_API_KEY not configured. MerchOps AI will use deterministic fallback templates.');
    return;
  }

  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  console.log(`[INFO] Testing configured model: ${model}`);

  const start = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'MerchOps AI',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exact word PONG' }],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[FAIL] Model response HTTP ${res.status} (${elapsed}ms): ${errText}`);
      process.exit(1);
    }

    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content?.trim();
    console.log(`[PASS] Model responded in ${elapsed}ms: "${reply}"`);
  } catch (err) {
    console.error(`[FAIL] AI inference error: ${err.message}`);
    process.exit(1);
  }
}

main();

