export type Role = 'customer' | 'admin';
export type User = { id: number; email: string; fullName: string; role: Role };

export type RoomStatus = 'active' | 'maintenance';
export type Room = {
  id: number;
  name: string;
  description: string;
  capacity: number;
  hourlyPriceVnd: number;
  status: RoomStatus;
};

export type SlotState = 'free' | 'busy' | 'past';
export type Slot = { start: string; end: string; state: SlotState };
export type Availability = { date: string; roomStatus: RoomStatus; slots: Slot[] };

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type Booking = {
  id: number;
  roomId: number;
  roomName: string;
  start: string;
  end: string;
  status: BookingStatus;
  totalVnd: number;
  note: string | null;
  createdAt: string;
};
export type AdminBooking = Booking & { customerName: string; customerEmail: string };
export type AdminBookingPage = { items: AdminBooking[]; total: number; page: number; pageSize: number };

export type DailyRevenue = { day: string; revenueVnd: number; bookings: number };
export type RoomRevenue = { roomId: number; roomName: string; revenueVnd: number; bookings: number };
export type Stats = {
  from: string;
  to: string;
  revenueVnd: number;
  daily: DailyRevenue[];
  rooms: RoomRevenue[];
  statusCounts: Partial<Record<BookingStatus, number>>;
};
