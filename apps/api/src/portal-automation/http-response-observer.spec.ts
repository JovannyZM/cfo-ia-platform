import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeHttpResponse } from './playwright-browser.provider';

type Listener = (value: never) => void;

class FakeResponseSource {
  private readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, value: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value as never);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

const matcher = { method: 'POST', pathname: '/portales/invoice/validateCheck' };
const request = (method = 'POST', url = 'https://services3.costco.com.mx/portales/invoice/validateCheck') => ({
  method: () => method,
  url: () => url,
});

describe('Costco HTTP response observer lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves only when the matching response is received and removes listeners', async () => {
    vi.useFakeTimers();
    const source = new FakeResponseSource();
    const resultPromise = observeHttpResponse(source as never, matcher, 60_000);
    source.emit('request', request());
    await vi.advanceTimersByTimeAsync(25);
    source.emit('response', { request: () => request(), status: () => 201 });
    await expect(resultPromise).resolves.toEqual({ requestObserved: true, responseReceived: true, status: 201, durationMs: 25 });
    expect(source.listenerCount('request')).toBe(0);
    expect(source.listenerCount('response')).toBe(0);
  });

  it('returns UNKNOWN observation at timeout and removes listeners', async () => {
    vi.useFakeTimers();
    const source = new FakeResponseSource();
    const resultPromise = observeHttpResponse(source as never, matcher, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(resultPromise).resolves.toEqual({ requestObserved: false, responseReceived: false, status: null, durationMs: null });
    expect(source.listenerCount('request')).toBe(0);
    expect(source.listenerCount('response')).toBe(0);
  });

  it('ignores unrelated traffic and resolves only once', async () => {
    vi.useFakeTimers();
    const source = new FakeResponseSource();
    const resultPromise = observeHttpResponse(source as never, matcher, 60_000);
    source.emit('response', { request: () => request('GET'), status: () => 500 });
    source.emit('response', { request: () => request(), status: () => 201 });
    source.emit('response', { request: () => request(), status: () => 459 });
    await expect(resultPromise).resolves.toMatchObject({ responseReceived: true, status: 201 });
  });
});
