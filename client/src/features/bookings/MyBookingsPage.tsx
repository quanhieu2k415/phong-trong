import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice, errorText } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { api } from '../../lib/api';
import { bookingDay, formatVnd, timeRange } from '../../lib/format';
import { POLL_MS } from '../../lib/query-client';
import type { Booking } from '../../lib/types';

const HISTORY_STEP = 10;

const isActive = (booking: Booking): boolean => booking.status === 'pending' || booking.status === 'confirmed';
const isUpcoming = (booking: Booking, now: number): boolean => new Date(booking.start).getTime() > now;

function CancelButton({ booking }: { booking: Booking }) {
  const [isAsking, setIsAsking] = useState(false);
  const client = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(booking.id),
    onSettled: () => {
      setIsAsking(false);
      client.invalidateQueries({ queryKey: ['my-bookings'] });
      client.invalidateQueries({ queryKey: ['availability', booking.roomId] });
    },
  });

  if (!isAsking) {
    return (
      <>
        {cancel.isError && <Notice tone="error">{errorText(cancel.error)}</Notice>}
        <button type="button" className="btn btn-ghost" onClick={() => setIsAsking(true)}>
          Huỷ đơn
        </button>
      </>
    );
  }
  return (
    <div className="confirm-row">
      <span>Huỷ đơn này?</span>
      <button type="button" className="btn btn-danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
        Xác nhận huỷ
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setIsAsking(false)}>
        Giữ lại
      </button>
    </div>
  );
}

function BookingCard({ booking, canCancel }: { booking: Booking; canCancel: boolean }) {
  return (
    <li className="ticket">
      <div className="ticket-when">
        <strong>{bookingDay(booking.start)}</strong>
        <span>{timeRange(booking.start, booking.end)}</span>
      </div>
      <div className="ticket-what">
        <Link to={`/phong/${booking.roomId}`}>{booking.roomName}</Link>
        <span>{formatVnd(booking.totalVnd)}</span>
        {booking.note && <p className="ticket-note">{booking.note}</p>}
      </div>
      <div className="ticket-side">
        <StatusBadge status={booking.status} />
        {canCancel && <CancelButton booking={booking} />}
      </div>
    </li>
  );
}

export default function MyBookingsPage() {
  const bookings = useQuery({ queryKey: ['my-bookings'], queryFn: api.myBookings, refetchInterval: POLL_MS });
  const [historyShown, setHistoryShown] = useState(HISTORY_STEP);
  const list = bookings.data ?? [];
  const now = Date.now();
  const upcoming = list.filter((booking) => isActive(booking) && isUpcoming(booking, now)).reverse();
  const history = list.filter((booking) => !upcoming.includes(booking));

  return (
    <>
      <h1 className="page-title">Đơn của tôi</h1>
      {bookings.isError && (
        <Notice tone="error" onRetry={() => bookings.refetch()}>
          {errorText(bookings.error)}
        </Notice>
      )}
      {bookings.isPending && <p className="muted">Đang tải…</p>}
      {bookings.isSuccess && list.length === 0 && (
        <section className="empty">
          <p>Bạn chưa có đơn nào.</p>
          <Link to="/" className="btn btn-primary">
            Xem lịch phòng
          </Link>
        </section>
      )}
      {upcoming.length > 0 && (
        <section aria-labelledby="sap-toi">
          <h2 id="sap-toi">Sắp tới</h2>
          <ul className="tickets">
            {upcoming.map((booking) => (
              <BookingCard key={booking.id} booking={booking} canCancel />
            ))}
          </ul>
        </section>
      )}
      {history.length > 0 && (
        <section aria-labelledby="lich-su">
          <h2 id="lich-su">Lịch sử</h2>
          <ul className="tickets">
            {history.slice(0, historyShown).map((booking) => (
              <BookingCard key={booking.id} booking={booking} canCancel={false} />
            ))}
          </ul>
          {history.length > historyShown && (
            <button
              type="button"
              className="btn btn-ghost show-more"
              onClick={() => setHistoryShown((shown) => shown + HISTORY_STEP)}
            >
              Xem thêm ({history.length - historyShown})
            </button>
          )}
        </section>
      )}
    </>
  );
}
