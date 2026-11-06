import { Icon, type IconName } from './Icon';
import type { BookingStatus } from '../lib/types';

const STATUS: Record<BookingStatus, { label: string; icon: IconName }> = {
  pending: { label: 'Chờ duyệt', icon: 'clock' },
  confirmed: { label: 'Đã xác nhận', icon: 'check' },
  rejected: { label: 'Bị từ chối', icon: 'x' },
  cancelled: { label: 'Đã huỷ', icon: 'ban' },
};

export const statusLabel = (status: BookingStatus): string => STATUS[status].label;

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, icon } = STATUS[status];
  return (
    <span className="badge" data-status={status}>
      <Icon name={icon} size={14} />
      {label}
    </span>
  );
}
