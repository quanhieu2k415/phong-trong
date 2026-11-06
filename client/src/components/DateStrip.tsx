import { addDays, shortDay, today, weekday } from '../lib/format';

const MAX_DAYS_AHEAD = 60;

type DateStripProps = {
  value: string;
  onChange: (day: string) => void;
  count: number;
};

export function DateStrip({ value, onChange, count }: DateStripProps) {
  const first = today();
  const days = Array.from({ length: count }, (_, index) => addDays(first, index));

  return (
    <div className="date-row">
      <div className="date-strip" role="group" aria-label="Chọn ngày">
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            className="date-chip"
            aria-pressed={day === value}
            onClick={() => onChange(day)}
          >
            <span className="date-chip-day">{index === 0 ? 'Hôm nay' : weekday(day)}</span>
            <span className="date-chip-date">{shortDay(day)}</span>
          </button>
        ))}
      </div>
      <label className="date-other">
        <span>Ngày khác</span>
        <input
          type="date"
          value={value}
          min={first}
          max={addDays(first, MAX_DAYS_AHEAD - 1)}
          onChange={(event) => event.target.value && onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
