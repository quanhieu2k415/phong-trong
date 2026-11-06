import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Notice } from './Notice';
import { useMe } from '../lib/queries';

export function RequireUser({ admin = false }: { admin?: boolean }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();

  if (isPending) return <p className="muted">Đang tải…</p>;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/dang-nhap?next=${next}`} replace />;
  }
  if (admin && user.role !== 'admin') {
    return <Notice tone="error">Trang này chỉ dành cho quản trị viên.</Notice>;
  }
  return <Outlet />;
}
