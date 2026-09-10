import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateUUID, randomUUID } from '../lib/uuid';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('UUID utility (generateUUID & randomUUID)', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // Restore global crypto
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('generates a valid RFC 4122 v4 UUID in standard secure environment', () => {
    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
    expect(randomUUID()).toMatch(UUID_V4_REGEX);
  });

  it('generates unique IDs across calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      set.add(generateUUID());
    }
    expect(set.size).toBe(100);
  });

  it('safely falls back to crypto.getRandomValues when crypto.randomUUID is undefined (HTTP LAN / iOS Safari)', () => {
    // Simulate non-secure context where crypto.randomUUID is undefined but getRandomValues is available
    const fakeCrypto = {
      getRandomValues: (buffer: Uint8Array) => originalCrypto.getRandomValues(buffer),
    };

    Object.defineProperty(globalThis, 'crypto', {
      value: fakeCrypto,
      configurable: true,
      writable: true,
    });

    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it('safely falls back to timestamp + Math.random when crypto is completely absent', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });

  it('handles crypto throwing an unexpected error gracefully', () => {
    const buggyCrypto = {
      randomUUID: () => {
        throw new Error('Not supported in this context');
      },
      getRandomValues: () => {
        throw new Error('Random values unavailable');
      },
    };

    Object.defineProperty(globalThis, 'crypto', {
      value: buggyCrypto,
      configurable: true,
      writable: true,
    });

    const id = generateUUID();
    expect(id).toMatch(UUID_V4_REGEX);
  });
});
