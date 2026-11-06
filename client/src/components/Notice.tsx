import type { ReactNode } from 'react';
import { Icon } from './Icon';

type NoticeProps = {
  tone?: 'error' | 'info' | 'success';
  children: ReactNode;
  onRetry?: () => void;
};

export function Notice({ tone = 'info', children, onRetry }: NoticeProps) {
  return (
    <div className="notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : 'alert'} />
      <div>{children}</div>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
