import type { DemoSnapshot } from './models';

/** Preserve M1.1/M1.2 browser-local sample data through the frontend migration. */
export const DEMO_KEY = 'dayframe.m1.design-demo.1';
export type DemoStorageStatus = 'available' | 'unavailable';

export function getDemoStorageStatus(): DemoStorageStatus {
  try {
    const key = '__dayframe_storage_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return 'available';
  } catch {
    return 'unavailable';
  }
}

/** The legacy local cache is untrusted. Never treat it as authenticated account data. */
export function readUntrustedDemoCache(): Partial<DemoSnapshot> | null {
  try {
    const text = localStorage.getItem(DEMO_KEY);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    return data !== null && typeof data === 'object' && !Array.isArray(data)
      ? data as Partial<DemoSnapshot>
      : null;
  } catch {
    return null;
  }
}
