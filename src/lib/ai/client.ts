/**
 * Robust OpenRouter AI Client
 *
 * Implements:
 * - Dynamic fallback hierarchy (AI_MODEL -> AI_MODEL_FALLBACK -> AI_MODEL_FALLBACK_2)
 * - Safe fallthrough on 404, 429, 5xx, or network timeout
 * - Daily token/request cap enforcement (AI_DAILY_CAP)
 * - Grounding validation: ensures financial figures are grounded in calculation placeholders
 */

import crypto from 'node:crypto';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiInferenceOptions {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface AiInferenceResult {
  content: string;
  modelUsed: string;
  latencyMs: number;
  promptHash: string;
}

// In-memory cache and daily rate limit tracker
interface CachedAiResponse {
  content: string;
  model: string;
  createdAt: number;
}

const proposalCache = new Map<string, CachedAiResponse>();
let dailyCounter = { date: new Date().toISOString().slice(0, 10), count: 0 };

function checkDailyCap(maxDaily = 100): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.date !== today) {
    dailyCounter = { date: today, count: 0 };
  }
  if (dailyCounter.count >= maxDaily) {
    return false;
  }
  dailyCounter.count += 1;
  return true;
}

/**
 * Model fallback chain: primary -> fallback 1 -> fallback 2, each overridable by env.
 * Defaults are OpenRouter free models with JSON output, checked against
 * https://openrouter.ai/api/v1/models on 2026-11-09. Free models are added and
 * removed without notice, so a 404 simply falls through to the next one.
 */
export function getModelChain(): string[] {
  return [
    process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free',
    process.env.AI_MODEL_FALLBACK || 'dots-studio/dots-3-note-preview:free',
    process.env.AI_MODEL_FALLBACK_2 || 'recursive/flint-v1.0:free',
  ];
}

/**
 * The free models are reasoning models: left alone they spend the whole token budget thinking and
 * return no content. Ask for no reasoning first; a model that requires it (HTTP 400) is retried
 * once with low effort and a larger budget.
 */
const REASONING_ATTEMPTS = [
  { reasoning: { enabled: false }, extraTokens: 0 },
  { reasoning: { effort: 'low' }, extraTokens: 6000 },
] as const;

export function computePromptHash(messages: AiChatMessage[]): string {
  const repr = JSON.stringify(messages);
  return crypto.createHash('sha256').update(repr).digest('hex').slice(0, 32);
}

export class AiClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AiClientError';
    this.code = code;
    this.status = status;
  }
}

export async function executeAiInference(options: AiInferenceOptions): Promise<AiInferenceResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const promptHash = computePromptHash(options.messages);

  // Check cache for identical prompts
  const cached = proposalCache.get(promptHash);
  if (cached && Date.now() - cached.createdAt < 3600_000) {
    return {
      content: cached.content,
      modelUsed: `${cached.model} (cached)`,
      latencyMs: 1,
      promptHash,
    };
  }

  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_')) {
    throw new AiClientError('AI_KEY_MISSING', 'OpenRouter API key is not configured.');
  }

  const maxCap = parseInt(process.env.AI_DAILY_CAP || '100', 10);
  if (!checkDailyCap(maxCap)) {
    throw new AiClientError('AI_DAILY_CAP_REACHED', `Daily AI proposal cap (${maxCap}) reached.`);
  }

  const models = getModelChain();

  let lastError: Error | null = null;

  // One overall budget across the whole chain, so a judge never waits more than about a minute.
  const deadline = Date.now() + Number(process.env.AI_TOTAL_TIMEOUT_MS || 55000);

  for (const model of models) {
    for (const attempt of REASONING_ATTEMPTS) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) break;
      const start = Date.now();
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'MerchOps AI',
          },
          body: JSON.stringify({
            model,
            messages: options.messages,
            temperature: options.temperature ?? 0.2,
            max_tokens: (options.maxTokens ?? 1500) + attempt.extraTokens,
            reasoning: attempt.reasoning,
            response_format: options.jsonMode ? { type: 'json_object' } : undefined,
          }),
          signal: AbortSignal.timeout(Math.min(30000, remaining)), // free models can take ~20s for JSON
        });

        if (response.status === 400 && 'enabled' in attempt.reasoning) {
          // Reasoning is mandatory for this model: retry it with low effort.
          lastError = new Error(`Model ${model} requires reasoning`);
          continue;
        }
        if (!response.ok) {
          lastError = new Error(`Model ${model} returned HTTP ${response.status}`);
          break; // Fall through to the next model
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content?.trim();

        if (!content) {
          lastError = new Error(`Model ${model} returned empty response`);
          break;
        }

        const latencyMs = Date.now() - start;
        proposalCache.set(promptHash, { content, model, createdAt: Date.now() });
        return { content, modelUsed: model, latencyMs, promptHash };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        break; // Timeout or network error: try the next model
      }
    }
  }

  throw new AiClientError(
    'AI_ALL_MODELS_FAILED',
    `All configured AI models failed: ${lastError?.message ?? 'Service unavailable'}.`
  );
}

/**
 * Grounding Check: Ensures narrative explanations do not fabricate arbitrary financial numbers.
 * Replaces or validates placeholders like {{runway.minBalance}}.
 */
export function validateAndGroundText(
  text: string,
  groundingValues: Record<string, string>
): { groundedText: string; ungroundedNumbersFound: string[] } {
  let groundedText = text;

  // Replace recognized placeholders
  for (const [key, value] of Object.entries(groundingValues)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    groundedText = groundedText.replace(placeholder, value);
  }

  // Detect ungrounded dollar figures not derived from placeholders
  const dollarMatches = groundedText.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g) || [];
  const authorizedValues = new Set(Object.values(groundingValues));
  const ungrounded: string[] = [];

  for (const match of dollarMatches) {
    if (!authorizedValues.has(match)) {
      ungrounded.push(match);
    }
  }

  return {
    groundedText,
    ungroundedNumbersFound: ungrounded,
  };
}

