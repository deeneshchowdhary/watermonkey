import { describe, expect, it, beforeEach } from 'vitest';
import { loadActivity, saveActivity } from './activityStore';

describe('activityStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadActivity()).toEqual([]);
  });

  it('round-trips events through localStorage', () => {
    saveActivity([{ id: '1', title: 'Scan completed' }]);
    expect(loadActivity()).toEqual([{ id: '1', title: 'Scan completed' }]);
  });

  it('reads pre-versioning data (a bare array) written by an older build', () => {
    localStorage.setItem('watermonkey-activity', JSON.stringify([{ id: '1', title: 'legacy event' }]));
    expect(loadActivity()).toEqual([{ id: '1', title: 'legacy event' }]);
  });

  it('bounds stored events to 250', () => {
    const events = Array.from({ length: 300 }, (_, i) => ({ id: String(i) }));
    const saved = saveActivity(events);
    expect(saved).toHaveLength(250);
    expect(loadActivity()).toHaveLength(250);
  });
});
