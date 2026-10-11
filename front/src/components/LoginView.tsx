import { useState } from 'react';
import { useAuth, type Profile } from '@/contexts/AuthContext';
import { getServerUrl } from '@/api/server';
import { Eye, EyeOff, Lock, Baby, ArrowLeft, Server, AlertCircle, Loader2, Sparkles, User, KeyRound } from 'lucide-react';
import TvKeyboard from '@/components/TvKeyboard';

export default function LoginView() {
  const { login, quickLogin, isLan, profiles, changeServer } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeField, setActiveField] = useState<'email' | 'password'>('password');

  const handleProfileSelect = async (p: Profile) => {
    setPinError('');
    setPinDigits([]);
    if (p.hasPin) {
      setSelectedProfile(p);
    } else {
      setSelectedProfile(p);
      setShowPasswordForm(true);
      setEmail(p.email);
      setPassword('');
      setActiveField('password');
      setError('');
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Заполните email и пароль');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyboardInput = (char: string) => {
    if (activeField === 'email') {
      setEmail((prev) => prev + char);
    } else {
      setPassword((prev) => prev + char);
    }
    setError('');
  };

  const handleKeyboardBackspace = () => {
    if (activeField === 'email') {
      setEmail((prev) => prev.slice(0, -1));
    } else {
      setPassword((prev) => prev.slice(0, -1));
    }
    setError('');
  };

  const handleKeyboardClear = () => {
    if (activeField === 'email') {
      setEmail('');
    } else {
      setPassword('');
    }
    setError('');
  };

  const showProfilesMode = isLan && profiles.length > 0 && !showPasswordForm;

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4 py-6 bg-[#060608] text-white">
      {/* Top right Server Switcher */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={changeServer}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 hover:border-amber-300/40 hover:bg-white/[0.1] focus:ring-2 focus:ring-amber-400 text-[12px] text-white/80 transition-all backdrop-blur-md outline-none cursor-pointer"
          title="Сменить медиасервер"
        >
          <Server className="h-3.5 w-3.5 text-amber-300" />
          <span className="font-mono text-white/90">{getServerUrl().replace(/^https?:\/\//, '')}</span>
          <span className="text-[11px] text-amber-300/80 font-medium ml-0.5">Сменить</span>
        </button>
      </div>

      <div className="w-full max-w-5xl flex flex-col items-center">
        {/* Profile Picker Mode */}
        {showProfilesMode && (
          <div className="w-full flex flex-col items-center animate-fade-in">
            {/* Header / Logo */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2.5 mb-2.5">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[6px] opacity-60" />
                  <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
                </div>
                <span className="text-display text-[26px] font-medium text-white/90">Lumière</span>
              </div>
              <h1 className="text-display text-[32px] font-medium text-white/95 tracking-tight">
                Кто смотрит?
              </h1>
              <p className="mt-1 text-[13px] text-white/45">
                Выберите профиль для быстрого входа
              </p>
            </div>

            {/* Profiles Grid */}
            <div className="flex flex-wrap items-center justify-center gap-6 mb-8 max-w-2xl">
              {profiles.map((p) => {
                const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProfileSelect(p)}
                    className="group flex flex-col items-center gap-3 p-4 rounded-[22px] transition-all hover:scale-105 focus:scale-105 focus:ring-4 focus:ring-amber-400 focus:bg-white/[0.08] outline-none cursor-pointer"
                  >
                    <div className="relative flex h-28 w-28 items-center justify-center rounded-[24px] bg-white/[0.04] border border-white/[0.09] shadow-2xl transition-all group-hover:border-amber-300/40 group-hover:bg-amber-300/[0.06] group-focus:border-amber-400">
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
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-amber-300 shadow-md">
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
                      <div className="text-[16px] font-medium text-white/90 group-hover:text-white transition-colors">
                        {p.name}
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        {p.role === 'admin' && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300/80 bg-amber-300/10 px-2 py-0.5 rounded-full border border-amber-300/20">
                            Админ
                          </span>
                        )}
                        {p.isKids && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-purple-300/80 bg-purple-300/10 px-2 py-0.5 rounded-full border border-purple-300/20">
                            Детский
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom links */}
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedProfile(null);
                  setEmail('');
                  setPassword('');
                  setShowPasswordForm(true);
                }}
                className="text-[13px] text-white/60 hover:text-white focus:text-white focus:ring-2 focus:ring-amber-400 transition-all py-1.5 px-4 rounded-full border border-white/10 hover:border-white/25 outline-none cursor-pointer"
              >
                Войти по логину и паролю
              </button>
            </div>
          </div>
        )}

        {/* PIN Entry Modal */}
        {selectedProfile && selectedProfile.hasPin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-[24px] bg-[#101014] border border-white/10 p-6 sm:p-8 flex flex-col items-center shadow-2xl">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300/10 border border-amber-300/20 text-[24px] font-bold text-amber-200 mb-3">
                {selectedProfile.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-[18px] font-medium text-white/95">{selectedProfile.name}</h3>
              <p className="mt-1 text-[13px] text-white/45 mb-5">Введите 4-значный PIN-код</p>

              {/* 4 PIN Dots */}
              <div className="flex gap-4 mb-6">
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
              <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mb-4">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handlePinDigit(digit)}
                    disabled={pinLoading}
                    className="flex h-13 items-center justify-center rounded-[14px] bg-white/[0.05] border border-white/[0.08] text-[20px] font-medium text-white/90 transition-all hover:bg-white/[0.12] focus:scale-105 focus:ring-2 focus:ring-amber-400 focus:bg-amber-400/20 active:scale-95 disabled:opacity-50 outline-none cursor-pointer"
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
                  className="flex h-13 items-center justify-center rounded-[14px] text-[13px] font-medium text-white/45 hover:text-white/80 focus:ring-2 focus:ring-amber-400 transition-colors outline-none cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit('0')}
                  disabled={pinLoading}
                  className="flex h-13 items-center justify-center rounded-[14px] bg-white/[0.05] border border-white/[0.08] text-[20px] font-medium text-white/90 transition-all hover:bg-white/[0.12] focus:scale-105 focus:ring-2 focus:ring-amber-400 focus:bg-amber-400/20 active:scale-95 disabled:opacity-50 outline-none cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handlePinBackspace}
                  disabled={pinLoading || pinDigits.length === 0}
                  className="flex h-13 items-center justify-center rounded-[14px] bg-white/[0.05] border border-white/[0.08] text-amber-300 transition-all hover:bg-white/[0.12] focus:scale-105 focus:ring-2 focus:ring-amber-400 active:scale-95 disabled:opacity-30 outline-none cursor-pointer"
                  title="Стереть цифру"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Widescreen Password Login Form with Integrated TV Keyboard */}
        {(!showProfilesMode || showPasswordForm) && (
          <div className="w-full animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="relative flex h-8 w-8 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[6px] opacity-60" />
                  <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
                </div>
                <div>
                  <h2 className="text-display text-[22px] font-medium text-white/95 leading-tight">
                    {selectedProfile ? `Вход: ${selectedProfile.name}` : 'Вход в аккаунт'}
                  </h2>
                  <p className="text-[12px] text-white/45">
                    {selectedProfile ? selectedProfile.email : 'Введите логин и пароль учётной записи'}
                  </p>
                </div>
              </div>

              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setSelectedProfile(null);
                    setError('');
                  }}
                  className="flex items-center gap-1.5 py-1.5 px-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] focus:ring-2 focus:ring-amber-400 border border-white/10 text-[12px] text-amber-200 transition-all outline-none cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Выбрать профиль</span>
                </button>
              )}
            </div>

            {/* 2-Column TV Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Form Fields (5 cols) */}
              <div className="lg:col-span-5 space-y-3.5 bg-white/[0.03] border border-white/[0.08] p-5 rounded-[22px] backdrop-blur-xl">
                {error && (
                  <div className="flex items-start gap-2.5 rounded-[12px] bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-300 animate-fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Email Box */}
                <div
                  tabIndex={0}
                  onClick={() => setActiveField('email')}
                  onFocus={() => setActiveField('email')}
                  className={`rounded-[14px] p-3 transition-all cursor-pointer border outline-none ${
                    activeField === 'email'
                      ? 'border-amber-400 bg-amber-400/[0.08] ring-2 ring-amber-400/30'
                      : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-amber-300" />
                      Email / Логин
                    </label>
                    {activeField === 'email' && (
                      <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest bg-amber-400/20 px-2 py-0.5 rounded-full">
                        ✏ Ввод
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[15px] text-white truncate min-h-[24px]">
                    {email || <span className="text-white/25">your@email.com</span>}
                  </div>
                </div>

                {/* Password Box */}
                <div
                  tabIndex={0}
                  onClick={() => setActiveField('password')}
                  onFocus={() => setActiveField('password')}
                  className={`rounded-[14px] p-3 transition-all cursor-pointer border outline-none ${
                    activeField === 'password'
                      ? 'border-amber-400 bg-amber-400/[0.08] ring-2 ring-amber-400/30'
                      : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-amber-300" />
                      Пароль
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPassword(!showPassword);
                        }}
                        className="text-white/40 hover:text-white focus:ring-2 focus:ring-amber-400 p-0.5 rounded outline-none"
                        title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {activeField === 'password' && (
                        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest bg-amber-400/20 px-2 py-0.5 rounded-full">
                          ✏ Ввод
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-mono text-[15px] text-white truncate min-h-[24px]">
                    {password ? (
                      showPassword ? password : '•'.repeat(password.length)
                    ) : (
                      <span className="text-white/25">Введите пароль</span>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading || !email.trim() || !password.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-[14px] bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black font-semibold text-[15px] shadow-lg shadow-amber-500/15 hover:brightness-110 focus:scale-[1.02] focus:ring-4 focus:ring-amber-300/80 active:scale-95 disabled:opacity-40 transition-all outline-none cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin text-black" />
                  ) : (
                    <Sparkles className="h-4.5 w-4.5 text-black" />
                  )}
                  <span>{loading ? 'Проверка...' : 'Войти'}</span>
                </button>
              </div>

              {/* Right Column: TV Keyboard (7 cols) */}
              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[12px] text-white/50 flex items-center gap-1.5">
                    <span>Сейчас редактируется:</span>
                    <span className="font-bold text-amber-300 font-mono">
                      {activeField === 'email' ? 'Email' : 'Пароль'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveField(activeField === 'email' ? 'password' : 'email')}
                    className="text-[11px] text-amber-300/80 hover:text-amber-200 focus:ring-2 focus:ring-amber-400 px-2.5 py-1 rounded-[8px] bg-white/[0.05] border border-white/[0.08] transition-all outline-none cursor-pointer"
                  >
                    ⇄ Перейти к {activeField === 'email' ? 'паролю' : 'email'}
                  </button>
                </div>

                <TvKeyboard
                  onInput={handleKeyboardInput}
                  onBackspace={handleKeyboardBackspace}
                  onClear={handleKeyboardClear}
                  onSubmit={() => handleSubmit()}
                  submitLabel="Войти"
                  presets={
                    activeField === 'email'
                      ? ['@gmail.com', '@yandex.ru', '@mail.ru', '.ru', '.com']
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

