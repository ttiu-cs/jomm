"use client";
/**
 * Plays Rosa's and her agent's lines with the natural voices from /api/voice (OpenAI TTS, cached).
 * If voices aren't available (no OpenAI key) or sound is off, it waits about as long as it takes
 * to read the line, so captions still pace naturally.
 */
export type VoiceRole = "owner" | "mina" | "agent";

const url = (role: VoiceRole, text: string) => `/api/voice?role=${role}&text=${encodeURIComponent(text)}`;
const readingMs = (text: string) => Math.min(6000, Math.max(1400, text.length * 55));
const cache = new Map<string, HTMLAudioElement>();
let voicesOk: boolean | null = null;

/** Starts generating/loading a line in the background so it plays without a gap. */
export function prefetch(role: VoiceRole, text: string) {
  if (typeof Audio === "undefined" || voicesOk === false) return;
  const k = `${role}|${text}`;
  if (cache.has(k)) return;
  const a = new Audio(url(role, text));
  a.preload = "auto";
  cache.set(k, a);
}

let current: HTMLAudioElement | null = null;
let currentFinish: (() => void) | null = null;
/** Stops the line being spoken; the replay moves on right away. */
export function stopVoice() {
  current?.pause();
  current = null;
  currentFinish?.();
}

export function speak(role: VoiceRole, text: string, opts: { muted?: boolean; signal?: { cancelled: boolean } } = {}): Promise<void> {
  const wait = () => new Promise<void>((r) => setTimeout(r, readingMs(text)));
  if (opts.muted || typeof Audio === "undefined" || voicesOk === false) return wait();
  const k = `${role}|${text}`;
  const a = cache.get(k) ?? new Audio(url(role, text));
  cache.delete(k);
  // Only one voice at a time: stop whatever is still playing before this line starts.
  if (current && current !== a) {
    current.pause();
    currentFinish?.();
  }
  current = a;
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      a.pause(); // if a safety timer ends the line, it must also go quiet
      if (current === a) current = null;
      if (currentFinish === finish) currentFinish = null;
      resolve();
    };
    currentFinish = finish;
    a.onended = () => {
      voicesOk = true;
      setTimeout(finish, 250);
    };
    a.onerror = () => {
      voicesOk = false; // no key or TTS down: captions only from now on
      wait().then(finish);
    };
    a.play().catch(() => wait().then(finish)); // autoplay blocked: keep going silently
    // Never hang the replay, but give long lines (a Channel3 summary) their full length.
    let guard = setTimeout(finish, 20000);
    const fitGuard = () => {
      if (!Number.isFinite(a.duration)) return;
      clearTimeout(guard);
      guard = setTimeout(finish, a.duration * 1000 + 4000);
    };
    if (a.readyState >= 1) fitGuard(); // prefetched: length already known
    else a.onloadedmetadata = fitGuard;
  });
}
