import { defineConfig } from '@playwright/test';
// Real-model acceptance only; not part of the regular e2e suite. Run with `npm run acceptance`.
export default defineConfig({ testDir: './tests/acceptance', workers: 1, timeout: 20 * 60_000, reporter: 'list' });
