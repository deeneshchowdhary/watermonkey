import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// With `globals: false` in vitest.config.js, Testing Library's automatic
// cleanup (which normally hooks a global `afterEach`) never registers, so
// renders from earlier tests in the same file would otherwise pile up in
// the DOM. Wire it up explicitly instead.
afterEach(() => {
  cleanup();
});
