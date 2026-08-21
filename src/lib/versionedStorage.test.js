import { describe, expect, it, beforeEach } from 'vitest';
import { loadVersioned, saveVersioned } from './versionedStorage';

describe('versionedStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the fallback when nothing is stored', () => {
    expect(loadVersioned('k', 1, {}, 'fallback')).toBe('fallback');
  });

  it('returns the fallback on corrupt JSON', () => {
    localStorage.setItem('k', 'not json');
    expect(loadVersioned('k', 1, {}, 'fallback')).toBe('fallback');
  });

  it('round-trips current-version data unchanged', () => {
    saveVersioned('k', 2, { hello: 'world' });
    expect(loadVersioned('k', 2, {}, null)).toEqual({ hello: 'world' });
  });

  it('treats pre-versioning (unwrapped) data as version 0 and migrates it forward', () => {
    // Simulates data written before schema versioning existed.
    localStorage.setItem('k', JSON.stringify({ records: ['legacy'] }));
    const migrations = { 0: (data) => ({ ...data, migrated: true }) };
    const result = loadVersioned('k', 1, migrations, null);
    expect(result).toEqual({ records: ['legacy'], migrated: true });
  });

  it('chains multiple migrations in order up to the current version', () => {
    localStorage.setItem('k', JSON.stringify({ n: 0 }));
    const migrations = {
      0: (data) => ({ n: data.n + 1 }),
      1: (data) => ({ n: data.n + 10 }),
    };
    const result = loadVersioned('k', 2, migrations, null);
    expect(result).toEqual({ n: 11 });
  });

  it('stops upgrading and returns what it has if a migration step is missing', () => {
    localStorage.setItem('k', JSON.stringify({ version: 1, data: { n: 1 } }));
    // No migration defined for version 1 -> 2.
    const result = loadVersioned('k', 2, {}, null);
    expect(result).toEqual({ n: 1 });
  });

  it('does not error on data from a newer version than this build knows about', () => {
    localStorage.setItem('k', JSON.stringify({ version: 5, data: { n: 1 } }));
    const result = loadVersioned('k', 2, {}, null);
    expect(result).toEqual({ n: 1 });
  });
});
