import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { ME_KEY, queryClient, setSession } from './query-client';
import type { User } from './types';

const user = { id: 1, email: 'khach@test.vn', fullName: 'Khách', role: 'customer' } as User;

beforeEach(() => queryClient.clear());

describe('setSession', () => {
  it('reaches components that are already mounted', async () => {
    const observer = new QueryObserver(queryClient, { queryKey: ME_KEY, enabled: false });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));

    setSession(user);

    await vi.waitFor(() => expect(seen).toContain(user));
    unsubscribe();
  });

  it("drops the previous account's cached data", () => {
    queryClient.setQueryData(['my-bookings'], [{ id: 1 }]);

    setSession(user);

    expect(queryClient.getQueryData(['my-bookings'])).toBeUndefined();
    expect(queryClient.getQueryData(ME_KEY)).toEqual(user);
  });
});

describe('an expired session', () => {
  const failWith = async (status: number) => {
    const fail = () => Promise.reject(new ApiError(status, 'ERROR', 'Lỗi'));
    await new MutationObserver<unknown, Error, void>(queryClient, { mutationFn: fail }).mutate().catch(() => undefined);
  };

  it('signs the user out when a mutation answers 401', async () => {
    queryClient.setQueryData(ME_KEY, user);
    await failWith(401);
    expect(queryClient.getQueryData(ME_KEY)).toBeNull();
  });

  it('keeps the session on other mutation errors', async () => {
    queryClient.setQueryData(ME_KEY, user);
    await failWith(409);
    expect(queryClient.getQueryData(ME_KEY)).toEqual(user);
  });
});
