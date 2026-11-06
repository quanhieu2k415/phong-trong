import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Notice, errorText } from '../../components/Notice';
import { api, type RoomInput, type RoomPatch } from '../../lib/api';
import { formatVnd } from '../../lib/format';
import { useRooms } from '../../lib/queries';
import type { Room } from '../../lib/types';

const EMPTY_ROOM: RoomInput = { name: '', description: '', capacity: 4, hourlyPriceVnd: 100_000, status: 'active' };
const PRICE_STEP = 10_000;

function useRoomRefresh() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: ['rooms'] });
    client.invalidateQueries({ queryKey: ['room'] });
    client.invalidateQueries({ queryKey: ['availability'] });
  };
}

function RoomRow({ room }: { room: Room }) {
  const [price, setPrice] = useState(String(room.hourlyPriceVnd));
  const refresh = useRoomRefresh();
  const update = useMutation({
    mutationFn: (changes: RoomPatch) => api.updateRoom(room.id, changes),
    onSuccess: refresh,
  });

  const isClosed = room.status === 'maintenance';
  const newPrice = Number(price);
  const isPriceValid = price !== '' && Number.isInteger(newPrice) && newPrice >= 0;
  const upcoming = update.data?.upcomingBookings ?? 0;

  return (
    <li className="room-card">
      <div className="room-card-head">
        <h2>{room.name}</h2>
        <p className="muted small">
          {room.capacity} người · {formatVnd(room.hourlyPriceVnd)}/giờ
        </p>
      </div>
      <form
        className="price-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isPriceValid) update.mutate({ hourlyPriceVnd: newPrice });
        }}
      >
        <label htmlFor={`gia-${room.id}`}>Giá mỗi giờ (₫)</label>
        <div className="price-input">
          <input
            id={`gia-${room.id}`}
            type="number"
            min={0}
            step={PRICE_STEP}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={update.isPending || !isPriceValid || newPrice === room.hourlyPriceVnd}
          >
            Lưu giá
          </button>
        </div>
      </form>
      <div className="room-card-status">
        <span className="room-state" data-closed={isClosed}>
          {isClosed ? 'Đang bảo trì' : 'Đang mở'}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={update.isPending}
          onClick={() => update.mutate({ status: isClosed ? 'active' : 'maintenance' })}
        >
          {isClosed ? 'Mở lại phòng' : 'Chuyển bảo trì'}
        </button>
      </div>
      {update.isError && <Notice tone="error">{errorText(update.error)}</Notice>}
      {isClosed && upcoming > 0 && (
        <Notice>Phòng còn {upcoming} đơn sắp tới. Hãy liên hệ khách hoặc xử lý ở mục Duyệt đơn.</Notice>
      )}
    </li>
  );
}

function NewRoomForm() {
  const [room, setRoom] = useState<RoomInput>(EMPTY_ROOM);
  const refresh = useRoomRefresh();
  const create = useMutation({
    mutationFn: () => api.createRoom(room),
    onSuccess: () => {
      refresh();
      setRoom(EMPTY_ROOM);
    },
  });
  const set = (changes: Partial<RoomInput>) => setRoom((current) => ({ ...current, ...changes }));
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form className="new-room" onSubmit={onSubmit} aria-labelledby="them-phong">
      <h2 id="them-phong">Thêm phòng</h2>
      <div className="field">
        <label htmlFor="ten-phong">Tên phòng</label>
        <input
          id="ten-phong"
          required
          minLength={2}
          maxLength={80}
          value={room.name}
          onChange={(event) => set({ name: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="mo-ta">Mô tả</label>
        <textarea
          id="mo-ta"
          rows={2}
          maxLength={1000}
          value={room.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </div>
      <div className="field-pair">
        <div className="field">
          <label htmlFor="suc-chua">Sức chứa</label>
          <input
            id="suc-chua"
            type="number"
            required
            min={1}
            max={500}
            value={room.capacity}
            onChange={(event) => set({ capacity: Number(event.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="gia-moi">Giá mỗi giờ (₫)</label>
          <input
            id="gia-moi"
            type="number"
            required
            min={0}
            step={PRICE_STEP}
            value={room.hourlyPriceVnd}
            onChange={(event) => set({ hourlyPriceVnd: Number(event.target.value) })}
          />
        </div>
      </div>
      {create.isError && <Notice tone="error">{errorText(create.error)}</Notice>}
      {create.isSuccess && <Notice tone="success">Đã thêm phòng.</Notice>}
      <button type="submit" className="btn btn-primary btn-wide" disabled={create.isPending}>
        {create.isPending ? 'Đang lưu…' : 'Thêm phòng'}
      </button>
    </form>
  );
}

export default function AdminRoomsPage() {
  const rooms = useRooms();
  return (
    <>
      <h1 className="page-title">Phòng</h1>
      {rooms.isError && (
        <Notice tone="error" onRetry={() => rooms.refetch()}>
          {errorText(rooms.error)}
        </Notice>
      )}
      <div className="admin-rooms">
        <ul className="room-cards">
          {rooms.data?.map((room) => (
            <RoomRow key={room.id} room={room} />
          ))}
        </ul>
        <NewRoomForm />
      </div>
    </>
  );
}
