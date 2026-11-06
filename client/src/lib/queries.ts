import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { ME_KEY, POLL_MS } from './query-client';

export const useMe = () => useQuery({ queryKey: ME_KEY, queryFn: api.me, staleTime: Infinity });

export const useRooms = () => useQuery({ queryKey: ['rooms'], queryFn: api.rooms });

export const availabilityKey = (roomId: number, date: string) => ['availability', roomId, date] as const;

export const availabilityQuery = (roomId: number, date: string) => ({
  queryKey: availabilityKey(roomId, date),
  queryFn: () => api.availability(roomId, date),
  refetchInterval: POLL_MS,
});

export const useBoard = (roomIds: number[], date: string) =>
  useQueries({ queries: roomIds.map((id) => availabilityQuery(id, date)) });
