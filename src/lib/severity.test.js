import { describe, expect, it } from 'vitest';
import { computeSeverity, SEVERITY_THRESHOLDS } from './severity';

describe('computeSeverity', () => {
  it('classifies below the medium threshold as Low', () => {
    expect(computeSeverity(0)).toBe('Low');
    expect(computeSeverity(9.99)).toBe('Low');
  });

  it('classifies at/above medium and below high as Medium', () => {
    expect(computeSeverity(SEVERITY_THRESHOLDS.medium)).toBe('Medium');
    expect(computeSeverity(49.99)).toBe('Medium');
  });

  it('classifies at/above the high threshold as High', () => {
    expect(computeSeverity(SEVERITY_THRESHOLDS.high)).toBe('High');
    expect(computeSeverity(1000)).toBe('High');
  });

  it('treats non-finite or missing input as zero, not a crash', () => {
    expect(computeSeverity(undefined)).toBe('Low');
    expect(computeSeverity(NaN)).toBe('Low');
    expect(computeSeverity(-5)).toBe('Low');
  });
});
