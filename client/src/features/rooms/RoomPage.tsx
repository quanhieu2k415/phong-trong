import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DateStrip } from '../../components/DateStrip';
import { Icon } from '../../components/Icon';
import { Notice, errorText } from '../../components/Notice';
import { api, ApiError } from '../../lib/api';
import { formatVnd, today } from '../../lib/format';
import { availabilityQuery } from '../../lib/queries';
import { parseSelection, pickSlot, selectionIsFree, type Selection } from '../../lib/slots';
import { BookingPanel } from './BookingPanel';
import { SlotPicker } from './SlotPicker';

const DAYS_ON_STRIP = 14;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function RoomPage() {
  const roomId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const [isBooked, setIsBooked] = useState(false);
  const requested = params.get('date') ?? '';
  const date = DAY_PATTERN.test(requested) ? requested : today();

  const room = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.room(roomId),
  });
  const availability = useQuery({ ...availabilityQuery(roomId, date), enabled: room.isSuccess });

  const slots = availability.data?.slots;
  const wanted = parseSelection(params.get('start'), params.get('end'));
  const selection = wanted && slots && selectionIsFree(wanted, slots) ? wanted : null;
  const wasTaken = wanted !== null && slots !== undefined && selection === null;

  const writeSelection = (next: Selection) => {
    const query: Record<string, string> = { date };
    if (next) {
      query.start = String(next.startHour);
      query.end = String(next.endHour);
    }
    setIsBooked(false);
    setParams(query, { replace: true });
  };

  if (room.isError) {
    const isBadId = room.error instanceof ApiError && room.error.status === 400;
    return (
      <Notice tone="error" onRetry={isBadId ? undefined : () => room.refetch()}>
        {isBadId ? 'Không tìm thấy phòng.' : errorText(room.error)} <Link to="/">Về lịch phòng</Link>
      </Notice>
    );
  }
  if (!room.data) return <p className="muted">Đang tải…</p>;

  const { name, description, capacity, hourlyPriceVnd, status } = room.data;
  const isClosed = status === 'maintenance';

  return (
    <div className="room-layout">
      <aside className="room-info">
        <Link to={`/?date=${date}`} className="back-link">
          <Icon name="back" size={16} /> Lịch phòng
        </Link>
        <h1>{name}</h1>
        {description && <p className="room-desc">{description}</p>}
        <dl className="room-facts">
          <div>
            <dt>Sức chứa</dt>
            <dd>{capacity} người</dd>
          </div>
          <div>
            <dt>Giá thuê</dt>
            <dd>{formatVnd(hourlyPriceVnd)}/giờ</dd>
          </div>
          <div>
            <dt>Đặt tối đa</dt>
            <dd>8 giờ mỗi đơn</dd>
          </div>
        </dl>
      </aside>

      <section className="picker" aria-labelledby="chon-gio">
        <h2 id="chon-gio">Chọn ngày và giờ</h2>
        <DateStrip value={date} count={DAYS_ON_STRIP} onChange={(day) => setParams({ date: day })} />
        {isClosed && <Notice>Phòng đang bảo trì nên tạm ngừng nhận đơn.</Notice>}
        {availability.isError && (
          <Notice tone="error" onRetry={() => availability.refetch()}>
            {errorText(availability.error)}
          </Notice>
        )}
        <p className="picker-hint">Chạm giờ bắt đầu, rồi chạm giờ cuối để chọn nhiều giờ liền nhau.</p>
        <SlotPicker
          slots={slots}
          selection={selection}
          disabled={isClosed}
          onPick={(hour) => slots && writeSelection(pickSlot(selection, hour, slots))}
        />
        {wasTaken && <Notice tone="error">Khung giờ bạn chọn vừa có người đặt. Vui lòng chọn giờ khác.</Notice>}
        {isBooked && (
          <Notice tone="success">
            Đã gửi yêu cầu. Theo dõi ở <Link to="/don-cua-toi">Đơn của tôi</Link>.
          </Notice>
        )}
        {selection && !isClosed && (
          <BookingPanel
            key={`${date}-${selection.startHour}-${selection.endHour}`}
            room={room.data}
            date={date}
            selection={selection}
            onBooked={() => {
              setParams({ date }, { replace: true });
              setIsBooked(true);
            }}
          />
        )}
      </section>
    </div>
  );
}
