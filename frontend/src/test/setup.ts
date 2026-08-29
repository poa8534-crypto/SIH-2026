import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * jsdom has neither of these. Providing them lets the field screen render its
 * normal states; the microphone-unavailable path is asserted separately by
 * removing the constructor again.
 */
class FakeRecognition {
  lang = 'en-IN';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: unknown = null;
  onerror: unknown = null;
  onend: unknown = null;
  onstart: unknown = null;
  start() {}
  stop() {}
  abort() {}
}

(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
