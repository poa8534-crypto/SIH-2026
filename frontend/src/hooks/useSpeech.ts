import { useCallback, useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '../config';

/**
 * Web Speech API only — no external service and no API key.
 *
 * Minimal local typings: SpeechRecognition is not in TypeScript's DOM lib, and
 * Chrome only exposes it as `webkitSpeechRecognition`.
 */
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * The speech languages, re-exported from the one list in config.
 *
 * There were two lists for three languages: this one (EN / हि / অস) and
 * `config.LANGUAGES` (English / Hindi / Assamese), which is exactly how the
 * Field header and the Profile screen could have offered different sets.
 * `config.LANGUAGES` carries all three forms — `code`, `short` and `label` —
 * so the compact header chips use `short` and Profile uses `label`, from one
 * definition. See D-031.
 */
export const SPEECH_LANGUAGES = LANGUAGES;

export type SpeechFailure = 'unsupported' | 'denied' | 'no-speech' | 'error';

/**
 * Map a SpeechRecognitionErrorEvent code to the state the UI shows.
 *
 * Exported so the mapping can be tested directly: the permission-denied path
 * is the one that will happen on stage, and it is not something to find out
 * about live. Returns null for codes that are not a user-visible failure.
 */
export function classifySpeechError(code: string): SpeechFailure | null {
  switch (code) {
    // The mic was refused, by the user or by policy. A normal condition on a
    // locked-down phone, not an error to alarm about.
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    // Heard nothing usable.
    case 'no-speech':
    case 'audio-capture':
      return 'no-speech';
    // We stopped it ourselves; not a failure.
    case 'aborted':
      return null;
    default:
      return 'error';
  }
}

interface UseSpeechResult {
  /** False when the browser has no Web Speech API at all. */
  supported: boolean;
  listening: boolean;
  /** True while listening but nothing is being heard right now. */
  silent: boolean;
  /** Grows live while listening — interimResults is on. */
  transcript: string;
  /** Seconds elapsed in the current recording. */
  elapsed: number;
  failure: SpeechFailure | null;
  lang: string;
  setLang: (code: string) => void;
  start: () => void;
  /** Stop and keep what was heard. */
  stop: () => void;
  /** Stop and throw it away. */
  cancel: () => void;
  clearFailure: () => void;
}

/**
 * One configured recognition object.
 *
 * `continuous` is true so a pause does not end the recording, and
 * `interimResults` is true so partial text shows live. Both restarts and the
 * first start go through here, so they cannot be configured differently.
 */
function buildRecognition(Ctor: SpeechRecognitionCtor, lang: string): SpeechRecognitionLike {
  const r = new Ctor();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}


/**
 * The chosen recognition language, shared by every `useSpeech()` in the app.
 *
 * `lang` used to be per-instance `useState`, which meant every caller had its
 * own: choosing Hindi on the Profile screen changed nothing about the
 * microphone on /field, and each Clarifications card ran its own recogniser
 * defaulting back to en-IN. A module-level value with subscribers is enough —
 * this is one preference, it belongs to the browser session, and it does not
 * need to reach the server.
 */
function getStoredLang(): string {
  if (typeof window === 'undefined') return LANGUAGES[0].code;
  try {
    const v = window.localStorage.getItem('navis.speech_lang');
    if (v && LANGUAGES.some((l) => l.code === v)) return v;
  } catch {
    /* ignore storage access error */
  }
  return LANGUAGES[0].code;
}

let sharedLang: string = getStoredLang();
const langSubscribers = new Set<(lang: string) => void>();

function setSharedLang(next: string) {
  if (next === sharedLang) return;
  sharedLang = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('navis.speech_lang', next);
    }
  } catch {
    /* ignore storage access error */
  }
  for (const notify of langSubscribers) notify(next);
}

export function useSpeech(): UseSpeechResult {
  // Feature-detected once on mount, so the caller can go straight to the
  // microphone-unavailable state instead of showing a mic that cannot work.
  const [supported] = useState(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [silent, setSilent] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<SpeechFailure | null>(
    getCtor() === null ? 'unsupported' : null
  );
  // Subscribed to the shared value, so a change anywhere is a change here.
  const [lang, setLangState] = useState<string>(sharedLang);
  useEffect(() => {
    const notify = (next: string) => setLangState(next);
    langSubscribers.add(notify);
    setLangState(sharedLang);
    return () => {
      langSubscribers.delete(notify);
    };
  }, []);
  const setLang = useCallback((next: string) => setSharedLang(next), []);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Everything finalised so far, across every restart. Chrome ends a
  // recognition session on its own even with continuous = true, so the
  // transcript cannot live inside one session object.
  const finalText = useRef('');
  const cancelled = useRef(false);
  // Set only by Stop & Process or Cancel. While false, a spontaneous `onend`
  // is Chrome giving up, not the supervisor finishing, and we restart.
  const stopRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(sharedLang);

  const stopTimer = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (silenceTimer.current !== null) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

  /** Mark the pause visible after a couple of quiet seconds. */
  const markSilence = () => {
    if (silenceTimer.current !== null) clearTimeout(silenceTimer.current);
    setSilent(false);
    silenceTimer.current = setTimeout(() => setSilent(true), 2000);
  };

  const teardown = useCallback(() => {
    stopTimer();
    const r = recognition.current;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      r.onstart = null;
    }
    recognition.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    recognition.current?.abort();
    teardown();
  }, [teardown]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setFailure('unsupported');
      return;
    }

    finalText.current = '';
    cancelled.current = false;
    stopRequested.current = false;
    setTranscript('');
    setElapsed(0);
    setSilent(false);
    setFailure(null);
    langRef.current = lang;

    // A site supervisor pauses mid-sentence. With continuous = false the
    // first silence ended the recording and the rest of the sentence was
    // lost, so recognition now runs until he taps Stop & Process or Cancel.
    const r = buildRecognition(Ctor, lang);

    r.onstart = () => {
      setListening(true);
      stopTimer();
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      markSilence();
    };

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setTranscript((finalText.current + interim).trim());
      markSilence();
    };

    r.onerror = (e) => {
      const failureKind = classifySpeechError(e.error);
      if (failureKind) setFailure(failureKind);
    };

    r.onend = () => {
      if (cancelled.current) {
        stopTimer();
        setListening(false);
        setSilent(false);
        setTranscript('');
        return;
      }

      if (!stopRequested.current) {
        // Chrome ends the session on its own after a pause. The supervisor is
        // still talking, so start a new one and keep everything finalised so
        // far — the timer keeps running and the transcript is not reset.
        try {
          const next = buildRecognition(getCtor()!, langRef.current);
          next.onstart = r.onstart;
          next.onresult = r.onresult;
          next.onerror = r.onerror;
          next.onend = r.onend;
          recognition.current = next;
          next.start();
          return;
        } catch {
          // Could not restart; fall through and end cleanly.
        }
      }

      stopTimer();
      setListening(false);
      setSilent(false);
      // Ended with nothing heard: that is the "couldn't understand" case.
      setFailure((prev) =>
        prev ?? (finalText.current.trim() === '' ? 'no-speech' : null)
      );
    };

    recognition.current = r;
    try {
      r.start();
    } catch {
      setFailure('error');
      teardown();
    }
  }, [lang, teardown]);

  const stop = useCallback(() => {
    cancelled.current = false;
    stopRequested.current = true;
    recognition.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stopRequested.current = true;
    recognition.current?.abort();
    setTranscript('');
    setElapsed(0);
    setSilent(false);
  }, []);

  const clearFailure = useCallback(() => setFailure(null), []);

  return {
    supported,
    listening,
    silent,
    transcript,
    elapsed,
    failure,
    lang,
    setLang,
    start,
    stop,
    cancel,
    clearFailure,
  };
}
