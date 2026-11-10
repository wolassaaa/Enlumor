import { defineConfig } from 'vitest/config';
// Real-SQLite editing suites take 6-13 s per test on GitHub's Windows runners (5 s default timed out on main, 2026-11-10).
export default defineConfig({ test: { include: ['tests/*.test.ts'], testTimeout: 30_000 } });
