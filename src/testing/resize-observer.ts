/** jsdom has no ResizeObserver; @foblex/flow needs one to render nodes. */
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export function stubResizeObserver(): void {
  const scope = globalThis as { ResizeObserver?: unknown };
  scope.ResizeObserver ??= NoopResizeObserver;
}
