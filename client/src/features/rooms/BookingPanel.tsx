import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Notice, errorText } from '../../components/Notice';
import { api, ApiError } from '../../lib/api';
import { clockHour, dayLabel, formatVnd } from '../../lib/format';
import { availabilityKey, useMe } from '../../lib/queries';
import { selectionRange, type Selection } from '../../lib/slots';
import type { Room } from '../../lib/types';

const CONFLICTS = new Set(['SLOT_TAKEN', 'ROOM_UNAVAILABLE']);
const MAX_NOTE = 500;

type BookingPanelProps = {
  room: Room;
  date: string;
  selection: NonNullable<Selection>;
  onBooked: () => void;
};

export function BookingPanel({ room, date, selection, onBooked }: BookingPanelProps) {
  const [note, setNote] = useState('');
  const { data: user } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const hours = selection.endHour - selection.startHour;

  const book = useMutation({
    mutationFn: () => api.createBooking({ roomId: room.id, ...selectionRange(date, selection), note: note || undefined }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: availabilityKey(room.id, date) });
      client.invalidateQueries({ queryKey: ['my-bookings'] });
      onBooked();
    },
    onError: (error) => {
      if (error instanceof ApiError && CONFLICTS.has(error.code)) {
        client.invalidateQueries({ queryKey: availabilityKey(room.id, date) });
        client.invalidateQueries({ queryKey: ['room', room.id] });
      }
    },
  });

  const onConfirm = () => {
    if (user) return book.mutate();
    const next = encodeURIComponent(location.pathname + location.search);
    navigate(`/dang-nhap?next=${next}`);
  };

  return (
    <div className="summary">
      <dl className="summary-facts">
        <div>
          <dt>Ngày</dt>
          <dd>{dayLabel(date)}</dd>
        </div>
        <div>
          <dt>Giờ</dt>
          <dd>
            {clockHour(selection.startHour)} – {clockHour(selection.endHour)} ({hours} giờ)
          </dd>
        </div>
        <div>
          <dt>Tạm tính</dt>
          <dd className="summary-total">{formatVnd(hours * room.hourlyPriceVnd)}</dd>
        </div>
      </dl>
      <div className="field">
        <label htmlFor="ghi-chu">Ghi chú cho quản lý (không bắt buộc)</label>
        <textarea id="ghi-chu" rows={2} maxLength={MAX_NOTE} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {book.isError && <Notice tone="error">{errorText(book.error)}</Notice>}
      <button type="button" className="btn btn-primary btn-wide" disabled={book.isPending} onClick={onConfirm}>
        {book.isPending ? 'Đang gửi…' : user ? 'Gửi yêu cầu đặt phòng' : 'Đăng nhập để đặt phòng'}
      </button>
      <p className="muted small">
        Khung giờ được giữ tối đa 24 giờ để quản lý duyệt. Xem trạng thái ở <Link to="/don-cua-toi">Đơn của tôi</Link>.
      </p>
    </div>
  );
}
