import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Notice, errorText } from '../../components/Notice';
import { statusLabel } from '../../components/StatusBadge';
import { api } from '../../lib/api';
import { addDays, dayLabel, formatVnd, shortDay, today } from '../../lib/format';
import type { BookingStatus, Stats } from '../../lib/types';
import { RevenueChart } from './RevenueChart';

const PRESETS = [7, 30, 90];
const DEFAULT_DAYS = 30;
const STATUSES: BookingStatus[] = ['confirmed', 'pending', 'rejected', 'cancelled', 'expired'];

function Summary({ stats }: { stats: Stats }) {
  const confirmed = stats.statusCounts.confirmed ?? 0;
  const average = confirmed > 0 ? Math.round(stats.revenueVnd / confirmed) : 0;
  return (
    <section className="stats-top" aria-label="Tổng quan">
      <div className="hero-figure">
        <p>Doanh thu đã xác nhận</p>
        <strong>{formatVnd(stats.revenueVnd)}</strong>
        <span className="muted small">
          {shortDay(stats.from)} – {shortDay(stats.to)}
        </span>
      </div>
      <dl className="stat-tiles">
        <div>
          <dt>Đơn đã xác nhận</dt>
          <dd>{confirmed}</dd>
        </div>
        <div>
          <dt>Trung bình mỗi đơn</dt>
          <dd>{formatVnd(average)}</dd>
        </div>
        {STATUSES.slice(1).map((status) => (
          <div key={status}>
            <dt>{statusLabel(status)}</dt>
            <dd>{stats.statusCounts[status] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RoomTable({ stats }: { stats: Stats }) {
  return (
    <section aria-labelledby="theo-phong">
      <h2 id="theo-phong">Theo phòng</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Phòng</th>
              <th scope="col" className="num">
                Đơn
              </th>
              <th scope="col" className="num">
                Doanh thu
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.rooms.map((room) => (
              <tr key={room.roomId}>
                <td>{room.roomName}</td>
                <td className="num">{room.bookings}</td>
                <td className="num">{formatVnd(room.revenueVnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DailyTable({ stats }: { stats: Stats }) {
  return (
    <details className="chart-table">
      <summary>Xem dạng bảng</summary>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col" className="num">
                Đơn
              </th>
              <th scope="col" className="num">
                Doanh thu
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.daily.map((day) => (
              <tr key={day.day}>
                <td>{dayLabel(day.day)}</td>
                <td className="num">{day.bookings}</td>
                <td className="num">{formatVnd(day.revenueVnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function StatsPage() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get('days'));
  const days = PRESETS.includes(requested) ? requested : DEFAULT_DAYS;
  const to = today();
  const from = addDays(to, 1 - days);

  const stats = useQuery({
    queryKey: ['stats', from, to],
    queryFn: () => api.stats(from, to),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <h1 className="page-title">Thống kê doanh thu</h1>
      <div className="filter-row" role="group" aria-label="Khoảng thời gian">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="filter-chip"
            aria-pressed={preset === days}
            onClick={() => setParams({ days: String(preset) })}
          >
            {preset} ngày
          </button>
        ))}
      </div>
      {stats.isError && (
        <Notice tone="error" onRetry={() => stats.refetch()}>
          {errorText(stats.error)}
        </Notice>
      )}
      {stats.isPending && <p className="muted">Đang tải…</p>}
      {stats.data && (
        <div className="stats" data-stale={stats.isPlaceholderData}>
          <Summary stats={stats.data} />
          <section aria-labelledby="theo-ngay">
            <h2 id="theo-ngay">Doanh thu theo ngày</h2>
            <RevenueChart daily={stats.data.daily} />
            <DailyTable stats={stats.data} />
          </section>
          <RoomTable stats={stats.data} />
        </div>
      )}
    </>
  );
}
