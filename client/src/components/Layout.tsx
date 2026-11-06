import { useMutation } from '@tanstack/react-query';
import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { useMe } from '../lib/queries';

function AccountNav() {
  const { data: user } = useMe();
  const logout = useMutation({
    mutationFn: api.logout,
    // A full load drops every cached query, and no route guard can redirect to the login page first.
    onSuccess: () => window.location.assign('/'),
  });

  if (!user) {
    return (
      <NavLink to="/dang-nhap" className="nav-link">
        Đăng nhập
      </NavLink>
    );
  }
  return (
    <>
      <span className="nav-user" title={user.email}>
        {user.fullName}
      </span>
      <button type="button" className="nav-link nav-button" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Đăng xuất
      </button>
    </>
  );
}

export function Layout() {
  const { data: user } = useMe();
  return (
    <>
      <a className="skip-link" href="#noi-dung">
        Tới nội dung chính
      </a>
      <header className="site-header">
        <Link to="/" className="brand">
          Phòng <em>Trống</em>
        </Link>
        <nav aria-label="Điều hướng chính" className="site-nav">
          <NavLink to="/" end className="nav-link">
            Lịch phòng
          </NavLink>
          {user?.role === 'customer' && (
            <NavLink to="/don-cua-toi" className="nav-link">
              Đơn của tôi
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/quan-tri" className="nav-link">
              Quản trị
            </NavLink>
          )}
          <AccountNav />
        </nav>
      </header>
      <main id="noi-dung" className="page">
        <Suspense fallback={<p className="muted">Đang tải…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="site-footer">Mở cửa 08:00 – 22:00 mỗi ngày. Giờ hiển thị theo giờ Việt Nam.</footer>
    </>
  );
}
