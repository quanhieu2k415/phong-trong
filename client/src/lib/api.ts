import type {
  AdminBookingPage,
  Availability,
  Booking,
  BookingStatus,
  Room,
  Stats,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const UNKNOWN_MESSAGE = 'Có lỗi xảy ra. Vui lòng thử lại.';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  }).catch(() => {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
  });
  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? UNKNOWN_MESSAGE,
    );
  }
  return body.data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export type RoomInput = Pick<Room, 'name' | 'description' | 'capacity' | 'hourlyPriceVnd' | 'status'>;
export type RoomPatch = Partial<RoomInput>;
export type NewBooking = { roomId: number; start: string; end: string; note?: string };

export const api = {
  me: () => request<User | null>('/api/auth/me'),
  login: (input: { email: string; password: string }) => post<User>('/api/auth/login', input),
  register: (input: { email: string; password: string; fullName: string }) =>
    post<User>('/api/auth/register', input),
  logout: () => post<void>('/api/auth/logout'),

  rooms: () => request<Room[]>('/api/rooms'),
  room: (id: number) => request<Room>(`/api/rooms/${id}`),
  availability: (id: number, date: string) =>
    request<Availability>(`/api/rooms/${id}/availability?date=${encodeURIComponent(date)}`),

  createBooking: (input: NewBooking) => post<Booking>('/api/bookings', input),
  myBookings: () => request<Booking[]>('/api/bookings/mine'),
  cancelBooking: (id: number) => post<Booking>(`/api/bookings/${id}/cancel`),

  adminBookings: (status: BookingStatus | '', page: number) => {
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set('status', status);
    return request<AdminBookingPage>(`/api/admin/bookings?${query}`);
  },
  decide: (id: number, decision: 'confirm' | 'reject') =>
    post<Booking>(`/api/admin/bookings/${id}/decision`, { decision }),
  createRoom: (input: RoomInput) => post<Room>('/api/admin/rooms', input),
  updateRoom: (id: number, changes: RoomPatch) =>
    patch<{ room: Room; upcomingBookings: number }>(`/api/admin/rooms/${id}`, changes),
  stats: (from: string, to: string) =>
    request<Stats>(`/api/admin/stats?from=${from}&to=${to}`),
};
