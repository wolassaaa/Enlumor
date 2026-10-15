import { expect, it } from 'vitest';
import { assertPerformance } from '../scripts/performance-gate.mjs';
const good = { portableStartupMs: [400,500,600], scrolling: {frameP95Ms:16,retainedCanvases:8}, readingSave:{p95Ms:2} };
it('release performance gate accepts the measured budget', () => expect(() => assertPerformance(good)).not.toThrow());
it('release performance gate blocks slow, missing and nonfinite measurements', () => {
  for (const bad of [{}, {...good,readingSave:{p95Ms:30}}, {...good,portableStartupMs:[2000,3000,4000]}, {...good,scrolling:{frameP95Ms:60,retainedCanvases:8}}, {...good,readingSave:{p95Ms:NaN}}]) expect(() => assertPerformance(bad)).toThrow();
});
