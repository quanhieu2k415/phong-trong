import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Notice, errorText } from '../../components/Notice';
import { StatusBadge, statusLabel } from '../../components/StatusBadge';
import { api } from '../../lib/api';
import { bookingDay, formatVnd, timeRange } from '../../lib/format';
import type { AdminBooking, BookingStatus } from '../../lib/types';

const POLL_MS = 20_000;
const STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled'];
const ALL = 'all';

type Filter = BookingStatus | typeof ALL;

const parseFilter = (value: string | null): Filter =>
  value === ALL || STATUSES.includes(value as BookingStatus) ? (value as Filter) : 'pending';

function useDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'confirm' | 'reject' }) => api.decide(id, decision),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['admin-bookings'] });
      client.invalidateQueries({ queryKey: ['stats'] });
      client.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

function BookingRow({ booking }: { booking: AdminBooking }) {
  const decide = useDecision();
  const isPending = booking.status === 'pending';
  return (
    <tr>
      <td data-label="Khách">
        <strong>{booking.customerName}</strong>
        <span className="muted small cell-sub">{booking.customerEmail}</span>
      </td>
      <td data-label="Phòng">{booking.roomName}</td>
      <td data-label="Thời gian">
        {bookingDay(booking.start)}
        <span className="muted small cell-sub">{timeRange(booking.start, booking.end)}</span>
      </td>
      <td data-label="Tiền" className="num">
        {formatVnd(booking.totalVnd)}
      </td>
      <td data-label="Trạng thái">
        <StatusBadge status={booking.status} />
        {booking.note && <p className="ticket-note">{booking.note}</p>}
      </td>
      <td data-label="Thao tác">
        {isPending && (
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: booking.id, decision: 'confirm' })}
            >
              Duyệt
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: booking.id, decision: 'reject' })}
            >
              Từ chối
            </button>
          </div>
        )}
        {decide.isError && <Notice tone="error">{errorText(decide.error)}</Notice>}
      </td>
    </tr>
  );
}

export default function QueuePage() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('status'));
  const page = Math.max(1, Number(params.get('page')) || 1);

  const bookings = useQuery({
    queryKey: ['admin-bookings', filter, page],
    queryFn: () => api.adminBookings(filter === ALL ? '' : filter, page),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  });
  const { items = [], total = 0, pageSize = 50 } = bookings.data ?? {};
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const goTo = (next: number) => setParams({ status: filter, page: String(next) });

  return (
    <>
      <h1 className="page-title">Duyệt đơn</h1>
      <div className="filter-row" role="group" aria-label="Lọc theo trạng thái">
        {[...STATUSES, ALL as Filter].map((value) => (
          <button
            key={value}
            type="button"
            className="filter-chip"
            aria-pressed={filter === value}
            onClick={() => setParams({ status: value })}
          >
            {value === ALL ? 'Tất cả' : statusLabel(value)}
          </button>
        ))}
      </div>

      {bookings.isError && (
        <Notice tone="error" onRetry={() => bookings.refetch()}>
          {errorText(bookings.error)}
        </Notice>
      )}
      {bookings.isPending && <p className="muted">Đang tải…</p>}
      {bookings.isSuccess && items.length === 0 && <p className="empty">Không có đơn nào ở mục này.</p>}

      {items.length > 0 && (
        <div className="table-wrap" data-stale={bookings.isPlaceholderData}>
          <table className="data-table stacked">
            <thead>
              <tr>
                <th scope="col">Khách</th>
                <th scope="col">Phòng</th>
                <th scope="col">Thời gian</th>
                <th scope="col" className="num">
                  Tiền
                </th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((booking) => (
                <BookingRow key={booking.id} booking={booking} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="pager" aria-label="Phân trang">
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => goTo(page - 1)}>
            Trang trước
          </button>
          <span>
            Trang {page}/{pageCount}
          </span>
          <button type="button" className="btn btn-ghost" disabled={page >= pageCount} onClick={() => goTo(page + 1)}>
            Trang sau
          </button>
        </nav>
      )}
    </>
  );
}
