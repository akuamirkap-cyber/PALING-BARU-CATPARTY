import { useSyncExternalStore } from 'react';
import { tuningKey } from './tuning';
import type { CharacterResult } from './characterWorker';

let cache: Record<string, string> = {};
let cacheKey = '';
let snapshot: Record<string, string> = {};
const listeners = new Set<() => void>();

/** Clear stale object URLs when proportions or the selected shape change. */
export function resetPortraitsForCurrentTuning() {
  const revision = tuningKey();
  if (revision === cacheKey) return;
  for (const url of Object.values(cache)) URL.revokeObjectURL(url);
  cacheKey = revision;
  cache = {};
  snapshot = {};
  listeners.forEach(l => l());
}

/** Accept a portrait only if the player hasn't changed shape while it rendered. */
export function storePortraitUrl(result: CharacterResult, url: string) {
  if (result.job.revision !== tuningKey() || !result.job.portrait) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  resetPortraitsForCurrentTuning();
  const { id, portrait } = result.job;
  const key = `${id}:${portrait.eyeStyle}:${portrait.expression}`;
  if (cache[key]) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  cache[key] = url;
  snapshot = { ...cache };
  listeners.forEach(l => l());
}
export function storeWorkerPortrait(result: CharacterResult) {
  if (result.portrait) storePortraitUrl(result, URL.createObjectURL(result.portrait));
}

export function hasPortrait(id: string, eyeStyle: string, expression: string) {
  return cacheKey === tuningKey() && !!cache[`${id}:${eyeStyle}:${expression}`];
}

export function usePortraits() {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot
  );
}
