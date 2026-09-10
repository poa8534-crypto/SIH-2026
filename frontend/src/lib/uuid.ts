/**
 * Browser-compatible UUID v4 generator with fallbacks.
 *
 * Background:
 * `crypto.randomUUID()` is defined by W3C Web Cryptography API as restricted to
 * Secure Contexts (`window.isSecureContext === true`, e.g. HTTPS or localhost).
 * When accessing the frontend over a local LAN IP (e.g. http://192.168.1.7:5173 on mobile),
 * `crypto.randomUUID` is undefined in Safari (iOS) and Chromium.
 *
 * This utility safely generates an RFC 4122 v4 compliant UUID using:
 * 1. `crypto.randomUUID()` when available in a secure context.
 * 2. `crypto.getRandomValues()` in non-secure contexts (available on HTTP LAN in all modern browsers).
 * 3. Math.random() + high-resolution timestamp fallback for restricted or legacy environments.
 */

export function generateUUID(): string {
  // 1. Native crypto.randomUUID (available in Secure Contexts: HTTPS & localhost)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and proceed to fallback
  }

  // 2. crypto.getRandomValues (available in non-secure HTTP contexts across modern iOS/Safari & Chromium)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set version (4) at time-hi-and-version: 0100xxxx
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Set variant (RFC 4122) at clock-seq-hi-and-reserved: 10xxxxxx
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Ignore and proceed to fallback
  }

  // 3. Fallback: pseudo-random generator with high-resolution timestamp
  let d = Date.now();
  let d2 = (typeof performance !== 'undefined' && performance.now && performance.now() * 1000) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else if (d2 > 0) {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    } else {
      r = r | 0;
    }
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Re-export as randomUUID for drop-in semantics
export const randomUUID = generateUUID;
