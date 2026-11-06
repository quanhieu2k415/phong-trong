import { lazy } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { RequireUser } from './components/Guards';
import { Layout } from './components/Layout';

const RoomsPage = lazy(() => import('./features/rooms/RoomsPage'));
const RoomPage = lazy(() => import('./features/rooms/RoomPage'));
const AuthPage = lazy(() => import('./features/auth/AuthPage'));
const MyBookingsPage = lazy(() => import('./features/bookings/MyBookingsPage'));
const AdminLayout = lazy(() => import('./features/admin/AdminLayout'));
const QueuePage = lazy(() => import('./features/admin/QueuePage'));
const AdminRoomsPage = lazy(() => import('./features/admin/AdminRoomsPage'));
const StatsPage = lazy(() => import('./features/admin/StatsPage'));

function NotFound() {
  return (
    <section className="empty">
      <h1>Không tìm thấy trang</h1>
      <p>
        <Link to="/">Quay lại lịch phòng</Link>
      </p>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RoomsPage />} />
        <Route path="phong/:id" element={<RoomPage />} />
        <Route path="dang-nhap" element={<AuthPage mode="login" />} />
        <Route path="dang-ky" element={<AuthPage mode="register" />} />
        <Route element={<RequireUser />}>
          <Route path="don-cua-toi" element={<MyBookingsPage />} />
        </Route>
        <Route element={<RequireUser admin />}>
          <Route path="quan-tri" element={<AdminLayout />}>
            <Route index element={<QueuePage />} />
            <Route path="phong" element={<AdminRoomsPage />} />
            <Route path="thong-ke" element={<StatsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
