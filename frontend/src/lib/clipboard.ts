/**
 * Clipboard write with a non-secure-context fallback, and an honest result.
 *
 * Background — this is the same constraint that produced `lib/uuid.ts` (D-098).
 * `navigator.clipboard` is a Secure Context API: it exists on HTTPS and on
 * `localhost`, and is **undefined** on a plain-HTTP LAN origin such as
 * `http://192.168.1.7:5173`, which is exactly how the UI is reached from a
 * phone. Calling `navigator.clipboard.writeText(...)` there does not reject —
 * it throws `TypeError: Cannot read properties of undefined`, synchronously,
 * inside a click handler.
 *
 * Even in a secure context the promise can reject: the document may not be
 * focused, or the browser may refuse the write without user activation.
 *
 * Every call site used to be `navigator.clipboard.writeText(x)` — unawaited,
 * uncaught, with the "Copied" state set unconditionally on the next line. The
 * button therefore reported success while the write had failed. This returns
 * a boolean so the caller can show what actually happened.
 *
 * Order:
 * 1. `navigator.clipboard.writeText` when the API exists (secure contexts).
 * 2. `document.execCommand('copy')` over an off-screen textarea — deprecated,
 *    but it is the only thing that works on a non-secure origin and it is
 *    still implemented everywhere this demo runs.
 *
 * See D-106.
 */
export async function copyText(text: string): Promise<boolean> {
  // 1. Async Clipboard API — secure contexts only.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Rejected (no focus, no user activation, permission denied) — fall through.
  }

  // 2. execCommand fallback — works on plain-HTTP LAN origins.
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen rather than hidden: a display:none element cannot be selected.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
