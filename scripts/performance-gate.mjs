export function assertPerformance(report) {
  const finite = (n, limit) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= limit;
  const samples = report?.portableStartupMs;
  if (!Array.isArray(samples) || samples.length !== 3 || !samples.every(n => finite(n,60000))) throw Error('Invalid startup samples');
  const median = [...samples].sort((a,b) => a-b)[1];
  if (!finite(median,1500) || !finite(report?.scrolling?.frameP95Ms,34) || !finite(report?.scrolling?.retainedCanvases,30) || !finite(report?.readingSave?.p95Ms,20)) throw Error('Performance budget exceeded');
}
