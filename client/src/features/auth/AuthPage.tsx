import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Notice, errorText } from '../../components/Notice';
import { api } from '../../lib/api';
import { useMe } from '../../lib/queries';
import { setSession } from '../../lib/query-client';
import { safeNext } from '../../lib/safe-next';
import type { User } from '../../lib/types';

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;
const EMAIL = /^\S+@\S+\.\S+$/;

type Fields = { fullName: string; email: string; password: string };

function fieldErrors(fields: Fields, isRegister: boolean): Partial<Fields> {
  const errors: Partial<Fields> = {};
  if (isRegister && fields.fullName.trim().length < 2) errors.fullName = 'Vui lòng nhập họ tên.';
  if (!EMAIL.test(fields.email)) errors.email = 'Email chưa đúng định dạng.';
  if (fields.password.length < MIN_PASSWORD) errors.password = `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  return errors;
}

type FieldProps = {
  name: keyof Fields;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  maxLength?: number;
};

function Field({ name, label, error, onChange, ...input }: FieldProps) {
  const errorId = `${name}-loi`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        {...input}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { data: user } = useMe();
  const [fields, setFields] = useState<Fields>({ fullName: '', email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Fields, boolean>>>({});

  const submit = useMutation({
    mutationFn: (): Promise<User> => (isRegister ? api.register(fields) : api.login(fields)),
    onSuccess: (signedIn) => {
      setSession(signedIn);
      navigate(next, { replace: true });
    },
  });

  if (user) return <Navigate to={next} replace />;

  const errors = fieldErrors(fields, isRegister);
  const shown = (name: keyof Fields) => (touched[name] ? errors[name] : undefined);
  const bind = (name: keyof Fields) => ({
    name,
    value: fields[name],
    error: shown(name),
    onChange: (value: string) => setFields((current) => ({ ...current, [name]: value })),
    onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTouched({ fullName: true, email: true, password: true });
    if (Object.keys(errors).length === 0) submit.mutate();
  };

  const otherPath = `${isRegister ? '/dang-nhap' : '/dang-ky'}?next=${encodeURIComponent(next)}`;
  return (
    <section className="auth">
      <h1>{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
      <p className="muted">{isRegister ? 'Chỉ mất một phút, sau đó đặt phòng ngay.' : 'Đăng nhập để giữ khung giờ bạn chọn.'}</p>
      <form onSubmit={onSubmit} noValidate>
        {isRegister && <Field {...bind('fullName')} label="Họ tên" type="text" autoComplete="name" maxLength={100} />}
        <Field {...bind('email')} label="Email" type="email" autoComplete="email" />
        <Field
          {...bind('password')}
          label="Mật khẩu"
          type="password"
          maxLength={MAX_PASSWORD}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />
        {submit.isError && <Notice tone="error">{errorText(submit.error)}</Notice>}
        <button type="submit" className="btn btn-primary btn-wide" disabled={submit.isPending}>
          {submit.isPending ? 'Đang xử lý…' : isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
      </form>
      <p className="auth-switch">
        {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
        <Link to={otherPath}>{isRegister ? 'Đăng nhập' : 'Đăng ký'}</Link>
      </p>
    </section>
  );
}
