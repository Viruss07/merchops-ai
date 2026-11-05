import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isSameOrigin } from '../src/lib/http';

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/reset', { headers });
}

test('same-origin: accepts an Origin matching the request Host', () => {
  assert.equal(
    isSameOrigin(request({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })),
    true,
  );
});

test('same-origin: rejects a different Origin', () => {
  assert.equal(
    isSameOrigin(request({ origin: 'https://evil.example', host: '127.0.0.1:3000' })),
    false,
  );
});

test('same-origin: rejects cross-site Sec-Fetch-Site even with a matching Origin', () => {
  assert.equal(
    isSameOrigin(
      request({
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
        'sec-fetch-site': 'cross-site',
      }),
    ),
    false,
  );
});

test('same-origin: no Origin is allowed outside production and rejected in production', () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  try {
    env.NODE_ENV = 'development';
    assert.equal(isSameOrigin(request({ host: 'localhost:3000' })), true);
    env.NODE_ENV = 'production';
    assert.equal(isSameOrigin(request({ host: 'localhost:3000' })), false);
  } finally {
    env.NODE_ENV = previous;
  }
});
