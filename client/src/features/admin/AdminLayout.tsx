import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/quan-tri', label: 'Duyệt đơn', end: true },
  { to: '/quan-tri/phong', label: 'Phòng', end: false },
  { to: '/quan-tri/thong-ke', label: 'Thống kê', end: false },
];

export default function AdminLayout() {
  return (
    <>
      <nav className="admin-tabs" aria-label="Quản trị">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="admin-tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
