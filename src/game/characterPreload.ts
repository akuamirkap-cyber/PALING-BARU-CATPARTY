import { animalById, type AccessoryId } from './animals';
import type { EyeStyleId, ExpressionId } from './eyes';
import { hasCharacterAsset, installCharacterAsset } from './characterMesh';
import { getShapeMode, getTuning, tuningKey } from './tuning';
import { hasPortrait } from './portraits';
import type { CharacterJob, CharacterResult } from './characterWorker';

export type PreloadJob = Pick<CharacterJob, 'id' | 'noEars' | 'portrait'>;

export interface PreloadRosterEntry {
  def: { id: CharacterJob['id'] };
  acc: AccessoryId;
  eyeStyle: EyeStyleId;
  expression: ExpressionId;
}

/**
 * Mesh jobs for the whole roster, plus a face portrait for every cat whose
 * portrait is not cached yet — the in-game HUD shows these faces in its stock
 * bar, so a match must never run with emoji fallbacks in the rings.
 */
export function buildPreloadJobs(roster: PreloadRosterEntry[]): PreloadJob[] {
  const jobs: PreloadJob[] = [];
  const seen = new Set<string>();
  const portraitDone = new Set<string>();
  for (const r of roster) {
    const covered = r.acc === 'helmet' || r.acc.startsWith('cap');
    for (const noEars of covered && r.acc.startsWith('cap') ? [true, false] : [covered]) {
      const key = `${r.def.id}:${noEars}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pKey = `${r.def.id}:${r.eyeStyle}:${r.expression}`;
      const portrait = portraitDone.has(pKey) || hasPortrait(r.def.id, r.eyeStyle, r.expression)
        ? undefined
        : { eyeStyle: r.eyeStyle, expression: r.expression };
      if (portrait) portraitDone.add(pKey);
      jobs.push({ id: r.def.id, noEars, portrait });
    }
  }
  return jobs;
}

/** Run expensive SDF mesh creation outside the UI thread, one job at a time. */
export function preloadCharacters(jobs: PreloadJob[], options: {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  onPortrait?: (result: CharacterResult) => void;
  delayMs?: number;
} = {}): Promise<void> {
  const revision = tuningKey();
  const tuning = { ...getTuning() };
  const shapeMode = getShapeMode();
  const pending = jobs.filter(job => job.portrait || !hasCharacterAsset(animalById(job.id), job.noEars));
  if (!pending.length) return Promise.resolve();
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Web Workers unavailable'));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(new URL('./characterWorker.ts', import.meta.url), { type: 'module' }); }
    catch (error) { reject(error); return; }
    let done = 0, timer = 0, finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve();
    };
    const abort = () => finish();
    if (options.signal?.aborted) { finish(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    const next = () => {
      if (finished) return;
      if (done >= pending.length || revision !== tuningKey()) { finish(); return; }
      worker.postMessage({ ...pending[done], tuning, shapeMode, revision } satisfies CharacterJob);
    };
    worker.onmessage = (event: MessageEvent<{ result?: CharacterResult; error?: string }>) => {
      if (event.data.error || !event.data.result) { finish(new Error(event.data.error ?? 'Worker failed')); return; }
      const result = event.data.result;
      if (revision === tuningKey()) {
        installCharacterAsset(animalById(result.job.id), result.job.noEars, revision, result.asset);
        if (result.job.portrait) options.onPortrait?.(result);
      }
      done++;
      options.onProgress?.(done, pending.length);
      timer = window.setTimeout(next, options.delayMs ?? 0);
    };
    worker.onerror = () => finish(new Error('Character worker failed'));
    next();
  });
}
