import type { SyncedRecord } from './models';

/**
 * Field-level last-writer-wins merge.
 * For every field, the value with the greater HLC wins. Two people editing *different* fields of the
 * same record offline both keep their change; editing the *same* field resolves to the later edit.
 * Pure and deterministic: merge(a, b) and merge(b, a) produce the same result.
 */
export function mergeRecord<T extends SyncedRecord>(local: T | undefined, remote: T): T {
  if (!local) return remote;

  const out = { ...local, _hlc: { ...local._hlc } } as unknown as Record<string, unknown>;
  const outHlc = out['_hlc'] as Record<string, string>;
  const remoteAny = remote as unknown as Record<string, unknown>;

  for (const [field, remoteClock] of Object.entries(remote._hlc ?? {})) {
    const localClock = local._hlc?.[field];
    if (!localClock || remoteClock > localClock) {
      out[field] = remoteAny[field];
      outHlc[field] = remoteClock;
    }
  }
  return out as unknown as T;
}

/** Stamp every field in `patch` with a fresh clock value. */
export function stamp<T extends object>(patch: T, next: () => string): Record<string, string> {
  const hlc: Record<string, string> = {};
  for (const key of Object.keys(patch)) {
    if (key === 'id' || key === '_hlc') continue;
    hlc[key] = next();
  }
  return hlc;
}
