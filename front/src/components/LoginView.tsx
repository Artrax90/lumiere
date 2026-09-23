import { useState } from 'react';
import { useAuth, type Profile } from '@/contexts/AuthContext';
import { getServerUrl } from '@/api/server';
import { Eye, EyeOff, Lock, Baby, ArrowLeft, Delete, Server } from 'lucide-react';

export default function LoginView() {
  const { login, quickLogin, isLan, profiles, changeServer } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Classic password login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleProfileSelect = async (p: Profile) => {
    setPinError('');
    setPinDigits([]);
    if (p.hasPin) {
      setSelectedProfile(p);
    } else if (p.role === 'admin') {
      setShowPasswordForm(true);
      setEmail(p.email);
    } else {
      try {
        setPinLoading(true);
        await quickLogin(p.id);
      } catch (err: any) {
        setPinError(err.message || 'Ошибка входа');
        setSelectedProfile(p);
      } finally {
        setPinLoading(false);
      }
    }
  };

  const handlePinDigit = async (digit: string) => {
    if (!selectedProfile || pinLoading) return;
    if (pinDigits.length >= 4) return;

    const next = [...pinDigits, digit];
    setPinDigits(next);
    setPinError('');

    if (next.length === 4) {
      const fullPin = next.join('');
      setPinLoading(true);
      try {
        await quickLogin(selectedProfile.id, fullPin);
      } catch (err: any) {
        setPinError(err.message || 'Неверный PIN-код');
        setPinDigits([]);
      } finally {
        setPinLoading(false);
      }
    }
  };

  const handlePinBackspace = () => {
    if (pinLoading) return;
    setPinDigits((prev) => prev.slice(0, -1));
    setPinError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showProfilesMode = isLan && profiles.length > 0 && !showPasswordForm;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4 py-8">
      {/* Top right Server Switcher */}
      <div className="absolute top-6 right-6 z-20">
        <button
          type="button"
          onClick={changeServer}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/15 hover:border-amber-300/50 hover:bg-white/[0.1] text-[13px] text-white/80 hover:text-white transition-cinematic backdrop-blur-md group shadow-xl"
          title="Сменить адрес медиасервера"
        >
          <Server className="h-4 w-4 text-amber-300 group-hover:scale-110 transition-transform" />
          <span className="font-mono text-white/90">{getServerUrl().replace(/^https?:\/\//, '')}</span>
          <span className="text-[11px] text-amber-300/80 font-medium ml-1">Сменить</span>
        </button>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center">
        {/* Header / Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[4px] opacity-60" />
              <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
            </div>
            <span className="text-display text-[26px] font-medium text-white/90">Lumière</span>
          </div>
          <h1 className="text-display text-[30px] font-medium text-white/95">
            {showProfilesMode ? 'Кто смотрит?' : 'Вход в аккаунт'}
          </h1>
          <p className="mt-1 text-[14px] text-white/45">
            {showProfilesMode
              ? 'Выберите ваш профиль для продолжения'
              : 'Введите логин и пароль вашей учётной записи'}
          </p>
        </div>

        {/* Profile Picker Mode */}
        {showProfilesMode && (
          <div className="w-full flex flex-col items-center">
            <div className="flex flex-wrap items-center justify-center gap-6 mb-10 max-w-xl">
              {profiles.map((p) => {
                const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProfileSelect(p)}
                    className="group flex flex-col items-center gap-3 p-4 rounded-[20px] transition-cinematic hover:scale-105 focus:outline-none"
                  >
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-[24px] bg-white/[0.04] border border-white/[0.08] shadow-2xl transition-cinematic group-hover:border-amber-300/40 group-hover:bg-amber-300/[0.06] group-hover:shadow-amber-500/10">
                      {p.avatar ? (
                        <img
                          src={p.avatar}
                          alt={p.name}
                          className="h-full w-full rounded-[24px] object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-[24px] bg-gradient-to-br from-amber-200/20 to-amber-600/10 text-[36px] font-medium text-amber-200/80 group-hover:text-amber-100">
                          {initial}
                        </div>
                      )}

                      {/* Badges on Avatar */}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                        {p.hasPin && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-amber-300/80 shadow-md">
                            <Lock className="h-3 w-3" />
                          </div>
                        )}
                        {p.isKids && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/30 backdrop-blur-md border border-purple-400/20 text-purple-200 shadow-md">
                            <Baby className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-[15px] font-medium text-white/85 group-hover:text-white transition-colors">
                        {p.name}
                      </div>
                      <div className="mt-0.5 flex items-center justify-center gap-1.5">
                        {p.role === 'admin' && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300/70 bg-amber-300/10 px-2 py-0.5 rounded-full border border-amber-300/20">
                            Админ
                          </span>
                        )}
                        {p.isKids && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-purple-300/70 bg-purple-300/10 px-2 py-0.5 rounded-full border border-purple-300/20">
                            Детский
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Switch to Password Login */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="text-[13px] text-white/50 hover:text-white/80 transition-colors py-1 px-4 rounded-full border border-white/10 hover:border-white/20"
              >
                Войти по логину и паролю
              </button>
              <button
                type="button"
                onClick={changeServer}
                className="text-[12px] text-amber-300/50 hover:text-amber-300 transition-colors py-1"
              >
                Сменить сервер ({getServerUrl()})
              </button>
            </div>
          </div>
        )}

        {/* PIN Entry Modal Overlay */}
        {selectedProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-[24px] glass-panel border border-white/10 p-8 flex flex-col items-center shadow-2xl">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300/10 border border-amber-300/20 text-[24px] font-bold text-amber-200 mb-4">
                {selectedProfile.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-[18px] font-medium text-white/95">{selectedProfile.name}</h3>
              <p className="mt-1 text-[13px] text-white/45 mb-6">Введите 4-значный PIN-код</p>

              {/* 4 PIN Dots */}
              <div className="flex gap-4 mb-8">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = idx < pinDigits.length;
                  return (
                    <div
                      key={idx}
                      className={`h-4 w-4 rounded-full transition-all duration-200 ${
                        filled
                          ? 'bg-amber-300 scale-110 shadow-[0_0_12px_rgba(252,211,77,0.6)]'
                          : 'bg-white/10 border border-white/20'
                      }`}
                    />
                  );
                })}
              </div>

              {pinError && (
                <div className="mb-4 text-[13px] text-red-400 text-center font-medium">
                  {pinError}
                </div>
              )}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-[260px] mb-6">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handlePinDigit(digit)}
                    disabled={pinLoading}
                    className="flex h-14 items-center justify-center rounded-[16px] bg-white/[0.05] border border-white/[0.08] text-[20px] font-medium text-white/90 transition-cinematic hover:bg-white/[0.12] hover:border-amber-300/30 active:scale-95 disabled:opacity-50 select-none cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProfile(null);
                    setPinDigits([]);
                    setPinError('');
                  }}
                  className="flex h-14 items-center justify-center rounded-[16px] text-[13px] font-medium text-white/40 hover:text-white/70 transition-colors select-none cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit('0')}
                  disabled={pinLoading}
                  className="flex h-14 items-center justify-center rounded-[16px] bg-white/[0.05] border border-white/[0.08] text-[20px] font-medium text-white/90 transition-cinematic hover:bg-white/[0.12] hover:border-amber-300/30 active:scale-95 disabled:opacity-50 select-none cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handlePinBackspace}
                  disabled={pinLoading || pinDigits.length === 0}
                  className="flex h-14 items-center justify-center rounded-[16px] bg-white/[0.05] border border-white/[0.08] text-white/60 transition-cinematic hover:bg-white/[0.12] active:scale-95 disabled:opacity-30 select-none cursor-pointer"
                  title="Стереть цифру"
                  aria-label="Стереть цифру"
                >
                  <Delete className="h-5 w-5 pointer-events-none" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Standard Email + Password Form */}
        {(!showProfilesMode || showPasswordForm) && (
          <div className="w-full max-w-sm">
            {isLan && profiles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPasswordForm(false)}
                className="mb-4 flex items-center gap-2 text-[13px] text-amber-300/70 hover:text-amber-200 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Выбрать профиль
              </button>
            )}

            <form onSubmit={handleSubmit} className="glass-panel rounded-[20px] p-8 space-y-5">
              <div>
                <label className="block text-[12px] font-medium text-white/50 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full rounded-[12px] bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30 transition-cinematic"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-white/50 mb-2">Пароль</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    required
                    className="w-full rounded-[12px] bg-white/[0.04] border border-white/[0.08] px-4 py-3 pr-12 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30 transition-cinematic"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-cinematic"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-[10px] bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-300/90">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[12px] bg-amber-300/90 py-3.5 text-[14px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90 disabled:opacity-50"
              >
                {loading ? 'Загрузка...' : 'Войти'}
              </button>
            </form>

            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-center text-[12px] text-white/25">
                Сессия сохраняется в вашем браузере до выхода
              </p>
              <button
                type="button"
                onClick={changeServer}
                className="text-[12px] text-amber-300/50 hover:text-amber-300 transition-colors py-1"
              >
                Сменить сервер ({getServerUrl()})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
