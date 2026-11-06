import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import type { User } from './types';

const MAX_RETRIES = 2;
export const POLL_MS = 30_000;
export const ME_KEY = ['me'] as const;

const isClientError = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

const signOutOnExpiry = (error: unknown): void => {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME_KEY, null);
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signOutOnExpiry }),
  mutationCache: new MutationCache({ onError: signOutOnExpiry }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !isClientError(error) && count < MAX_RETRIES,
    },
  },
});

// clear() would detach mounted observers, so the session is written first and the rest reset in place.
export function setSession(user: User): void {
  queryClient.setQueryData(ME_KEY, user);
  void queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
}
