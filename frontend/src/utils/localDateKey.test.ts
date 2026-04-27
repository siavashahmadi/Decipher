import { describe, it, expect } from 'vitest';
import { localDateKey } from './localDateKey';

describe('localDateKey', () => {
  it('formats an ISO string to YYYY-MM-DD in local timezone', () => {
    const local = new Date(2026, 3, 20, 12, 0, 0); // Apr 20 2026 noon local
    expect(localDateKey(local.toISOString())).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    );
  });

  it('uses local date, not UTC date', () => {
    const lateLocal = new Date(2026, 3, 20, 23, 30, 0); // Apr 20 23:30 local
    const key = localDateKey(lateLocal.toISOString());
    const expected = `${lateLocal.getFullYear()}-${String(lateLocal.getMonth() + 1).padStart(2, '0')}-${String(lateLocal.getDate()).padStart(2, '0')}`;
    expect(key).toBe(expected);
  });
});
