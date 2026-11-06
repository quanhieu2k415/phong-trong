import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { axisTicks, extremeIndex } from '../../lib/chart';
import { compactVnd, dayLabel, formatVnd, shortDay } from '../../lib/format';
import type { DailyRevenue } from '../../lib/types';

const HEIGHT = 240;
const TOP = 22;
const BOTTOM = 26;
const LEFT = 44;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const X_LABELS = 5;
const MIN_WIDTH = 240;

const barPath = (x: number, y: number, width: number, baseline: number): string => {
  const radius = Math.min(RADIUS, width / 2, baseline - y);
  return `M${x},${baseline}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${baseline}Z`;
};

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_WIDTH * 2);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(MIN_WIDTH, entry.contentRect.width));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function RevenueChart({ daily }: { daily: DailyRevenue[] }) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const values = daily.map((day) => day.revenueVnd);
  const ticks = axisTicks(Math.max(...values, 0));
  const top = ticks.at(-1) ?? 1;
  const baseline = HEIGHT - BOTTOM;
  const plotWidth = width - LEFT;
  const band = plotWidth / Math.max(daily.length, 1);
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const yOf = (value: number) => baseline - (value / top) * (baseline - TOP);
  const xOf = (index: number) => LEFT + index * band + (band - barWidth) / 2;
  const peak = extremeIndex(values);
  const labelEvery = Math.max(1, Math.ceil(daily.length / X_LABELS));

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setActive((current) => Math.min(daily.length - 1, Math.max(0, (current ?? -1) + move)));
  };

  const shown = active === null ? undefined : daily[active];
  const tipLeft = active === null ? 0 : Math.min(Math.max(xOf(active) + barWidth / 2, 70), width - 70);

  return (
    <div ref={ref} className="chart" onMouseLeave={() => setActive(null)}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label="Biểu đồ cột doanh thu theo ngày. Dùng phím mũi tên trái phải để xem từng ngày."
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={width} y1={yOf(tick)} y2={yOf(tick)} className="chart-grid" />
            <text x={LEFT - 8} y={yOf(tick) + 4} textAnchor="end" className="chart-label">
              {compactVnd(tick)}
            </text>
          </g>
        ))}
        {daily.map((day, index) =>
          day.revenueVnd > 0 ? (
            <path
              key={day.day}
              d={barPath(xOf(index), yOf(day.revenueVnd), barWidth, baseline)}
              className="chart-bar"
              data-dim={active !== null && active !== index}
            />
          ) : null,
        )}
        {daily.map((day, index) =>
          index % labelEvery === 0 ? (
            <text key={day.day} x={xOf(index) + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="chart-label">
              {shortDay(day.day)}
            </text>
          ) : null,
        )}
        {peak >= 0 && (
          <text x={Math.min(xOf(peak) + barWidth / 2, width - 24)} y={yOf(values[peak]!) - 4} textAnchor="middle" className="chart-peak">
            {compactVnd(values[peak]!)}
          </text>
        )}
        {daily.map((day, index) => (
          <rect
            key={day.day}
            x={LEFT + index * band}
            y={0}
            width={band}
            height={baseline}
            fill="transparent"
            onMouseEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          />
        ))}
      </svg>
      <div className="chart-tip" data-show={Boolean(shown)} style={{ left: tipLeft }} aria-live="polite">
        {shown && (
          <>
            <strong>{formatVnd(shown.revenueVnd)}</strong>
            <span>{dayLabel(shown.day)}</span>
            <span>{shown.bookings} đơn</span>
          </>
        )}
      </div>
    </div>
  );
}
