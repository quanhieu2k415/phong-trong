import { Link, useSearchParams } from 'react-router-dom';
import { DateStrip } from '../../components/DateStrip';
import { Icon } from '../../components/Icon';
import { Notice, errorText } from '../../components/Notice';
import { dayLabel, formatVnd, today } from '../../lib/format';
import { useBoard, useRooms } from '../../lib/queries';
import type { Availability, Room, Slot } from '../../lib/types';

const OPEN_HOUR = 8;
const HOURS = 14;
const DAYS_ON_BOARD = 7;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const countFree = (slots: Slot[]): number => slots.filter((slot) => slot.state === 'free').length;

function BoardAxis() {
  return (
    <div className="board-axis" aria-hidden="true">
      <span />
      <div className="board-hours">
        {Array.from({ length: HOURS }, (_, index) => (
          <span key={index}>{String(OPEN_HOUR + index).padStart(2, '0')}</span>
        ))}
      </div>
      <span />
    </div>
  );
}

function BoardRow({ room, availability, date }: { room: Room; availability?: Availability; date: string }) {
  const isClosed = room.status === 'maintenance';
  const free = availability ? countFree(availability.slots) : null;
  const cells = availability?.slots ?? [];
  const summary = isClosed ? 'đang bảo trì' : free === null ? 'đang tải lịch' : `còn ${free} giờ trống`;

  return (
    <li>
      <Link to={`/phong/${room.id}?date=${date}`} className="board-row" aria-label={`${room.name}, ${summary}`}>
        <div className="board-room">
          <strong>{room.name}</strong>
          <span>
            {room.capacity} người · {formatVnd(room.hourlyPriceVnd)}/giờ
          </span>
        </div>
        <div className="board-cells" aria-hidden="true">
          {Array.from({ length: HOURS }, (_, index) => (
            <span key={index} className="cell" data-state={isClosed ? 'past' : (cells[index]?.state ?? 'loading')} />
          ))}
        </div>
        <div className="board-free">
          {isClosed ? (
            <>
              <Icon name="wrench" size={15} /> Bảo trì
            </>
          ) : free === null ? (
            '…'
          ) : (
            <>
              <b>{free}</b> giờ trống
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label="Chú thích">
      <li>
        <span className="cell" data-state="free" /> Còn trống
      </li>
      <li>
        <span className="cell" data-state="busy" /> Đã có người đặt
      </li>
      <li>
        <span className="cell" data-state="past" /> Đã qua
      </li>
    </ul>
  );
}

export default function RoomsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('date') ?? '';
  const date = DAY_PATTERN.test(requested) ? requested : today();
  const rooms = useRooms();
  const list = rooms.data ?? [];
  const board = useBoard(list.map((room) => room.id), date);

  const openRooms = list.filter((room) => room.status === 'active');
  const totalFree = list.reduce((sum, room, index) => {
    const slots = board[index]?.data?.slots;
    return room.status === 'active' && slots ? sum + countFree(slots) : sum;
  }, 0);

  return (
    <>
      <section className="board-head">
        <h1>
          Phòng nào đang <em>trống?</em>
        </h1>
        <p className="lede">
          {dayLabel(date)}: còn <b>{totalFree} giờ trống</b> trên {openRooms.length} phòng. Chọn một phòng để giữ chỗ.
        </p>
      </section>

      <DateStrip value={date} count={DAYS_ON_BOARD} onChange={(day) => setParams({ date: day })} />

      {rooms.isError && (
        <Notice tone="error" onRetry={() => rooms.refetch()}>
          {errorText(rooms.error)}
        </Notice>
      )}

      <section className="board" aria-label={`Lịch phòng ${dayLabel(date)}`}>
        <BoardAxis />
        <ul className="board-rows">
          {list.map((room, index) => (
            <BoardRow key={room.id} room={room} date={date} availability={board[index]?.data} />
          ))}
        </ul>
        {rooms.isSuccess && list.length === 0 && <p className="muted">Chưa có phòng nào.</p>}
      </section>
      <Legend />
    </>
  );
}
