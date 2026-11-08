import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import api from '@/lib/api';
import turfDetailsReducer, { fetchTurfDetails } from '@/store/turfDetailsSlice';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

const get = vi.mocked(api.get);

const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const response = (name: string) => ({ data: { status: true, turf: { id: 't1', name }, available_slots: [] } });

describe('fetchTurfDetails ordering', () => {
  beforeEach(() => get.mockReset());

  it('ignores an older response that arrives after a newer one', async () => {
    const first = deferred();
    const second = deferred();
    get.mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    const store = configureStore({ reducer: { turfDetails: turfDetailsReducer } });

    const a = store.dispatch(fetchTurfDetails({ turfId: 't1', date: '07-11-2026' }));
    const b = store.dispatch(fetchTurfDetails({ turfId: 't1', date: '08-11-2026' }));
    second.resolve(response('newer'));
    await b;
    first.resolve(response('older'));
    await a;

    const state = store.getState().turfDetails;
    expect(state.requestedDate).toBe('08-11-2026');
    expect(state.data?.turf.name).toBe('newer');
    expect(state.status).toBe('succeeded');
  });

  it('ignores a failure from an older request', async () => {
    const first = deferred();
    const second = deferred();
    get.mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    const store = configureStore({ reducer: { turfDetails: turfDetailsReducer } });

    const a = store.dispatch(fetchTurfDetails({ turfId: 't1', date: '07-11-2026' }));
    const b = store.dispatch(fetchTurfDetails({ turfId: 't1', date: '08-11-2026' }));
    second.resolve(response('newer'));
    await b;
    first.resolve(Promise.reject(new Error('boom')));
    await a;

    expect(store.getState().turfDetails.status).toBe('succeeded');
  });
});
