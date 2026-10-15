import type { Annotation, Quad } from './model';
export function transform(x: number, y: number, m: number[]): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function inverse(m: number[]): number[] {
  const d = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(d) || d === 0) throw new Error('INVALID_GEOMETRY');
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
export function screenRectToQuad(rect: [number, number, number, number], m: number[]): Quad {
  const inv = inverse(m);
  const points = [transform(rect[0], rect[1], inv), transform(rect[2], rect[1], inv), transform(rect[0], rect[3], inv), transform(rect[2], rect[3], inv)];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.max(...ys), b = Math.min(...ys);
  return [l, t, r, t, l, b, r, b];
}
export function quadToScreen(q: Quad, m: number[]): [number, number, number, number] {
  const points = [0, 2, 4, 6].map(i => transform(q[i], q[i + 1], m));
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
export function validateAnnotation(value: unknown, pageCount: number): asserts value is Annotation {
  const a = value as Annotation;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^[\w-]{1,100}$/.test(a.id) || typeof a.documentId !== 'string' || typeof a.fingerprint !== 'string' || !['highlight', 'underline', 'note'].includes(a.type) || a.author !== 'user' ||
      !Number.isInteger(a.pageIndex) || a.pageIndex < 0 || a.pageIndex >= pageCount ||
      typeof a.quote !== 'string' || a.quote.length > 100000 || typeof a.note !== 'string' || a.note.length > 100000 ||
      !/^#[0-9a-f]{6}$/i.test(a.color) || !Array.isArray(a.quads) || !a.quads.length || a.quads.length > 10000 ||
      a.quads.some(q => !Array.isArray(q) || q.length !== 8 || q.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e7) || q[2] <= q[0] || q[1] <= q[5])) {
    throw new Error('INVALID_ANNOTATION: 批注类型、页码或坐标无效');
  }
}
