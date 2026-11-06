import { clockHour } from '../../lib/format';
import { hourLabels, type Selection } from '../../lib/slots';
import type { Slot, SlotState } from '../../lib/types';

const STATE_LABEL: Record<SlotState, string> = { free: 'Trống', busy: 'Đã đặt', past: 'Đã qua' };
const SKELETON_SLOTS = 14;

type SlotPickerProps = {
  slots: Slot[] | undefined;
  selection: Selection;
  disabled: boolean;
  onPick: (hour: number) => void;
};

export function SlotPicker({ slots, selection, disabled, onPick }: SlotPickerProps) {
  if (!slots) {
    return (
      <div className="slot-grid" aria-busy="true">
        {Array.from({ length: SKELETON_SLOTS }, (_, index) => (
          <span key={index} className="slot" data-state="loading" />
        ))}
      </div>
    );
  }

  const hours = hourLabels(slots);
  return (
    <div className="slot-grid" role="group" aria-label="Chọn khung giờ">
      {slots.map((slot, index) => {
        const hour = hours[index]!;
        const isSelected = selection !== null && hour >= selection.startHour && hour < selection.endHour;
        const isBlocked = disabled || slot.state !== 'free';
        return (
          <button
            key={slot.start}
            type="button"
            className="slot"
            data-state={disabled ? 'past' : slot.state}
            aria-pressed={isSelected}
            aria-disabled={isBlocked}
            aria-label={`${clockHour(hour)} đến ${clockHour(hour + 1)}, ${STATE_LABEL[slot.state]}`}
            onClick={() => !isBlocked && onPick(hour)}
          >
            <span className="slot-hour">{clockHour(hour)}</span>
            <span className="slot-note">{isSelected ? 'Đã chọn' : STATE_LABEL[slot.state]}</span>
          </button>
        );
      })}
    </div>
  );
}
