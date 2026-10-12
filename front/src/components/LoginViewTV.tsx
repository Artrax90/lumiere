import { useState, useEffect, useRef } from 'react';
import { useAuth, type Profile } from '@/contexts/AuthContext';
import { getServerUrl } from '@/api/server';
import { Eye, EyeOff, Lock, Baby, ArrowLeft, Server, AlertCircle, Loader2, Sparkles, User, KeyRound, Check } from 'lucide-react';
import TvKeyboard from '@/components/TvKeyboard';

const AVATAR_PALETTES = [
  { bg: 'from-amber-400/25 via-amber-500/15 to-orange-600/25', border: 'border-amber-400/30', text: 'text-amber-200' },
  { bg: 'from-cyan-400/25 via-blue-500/15 to-indigo-600/25', border: 'border-cyan-400/30', text: 'text-cyan-200' },
  { bg: 'from-emerald-400/25 via-teal-500/15 to-cyan-600/25', border: 'border-emerald-400/30', text: 'text-emerald-200' },
  { bg: 'from-rose-400/25 via-pink-500/15 to-purple-600/25', border: 'border-rose-400/30', text: 'text-rose-200' },
  { bg: 'from-violet-400/25 via-purple-500/15 to-indigo-600/25', border: 'border-violet-400/30', text: 'text-violet-200' },
];

export default function LoginViewTV() {
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

  // Active field being edited via on-screen TV keyboard (null means keyboard is hidden!)
  const [editingField, setEditingField] = useState<'email' | 'password' | null>(null);

  const emailBoxRef = useRef<HTMLDivElement>(null);
  const passwordBoxRef = useRef<HTMLDivElement>(null);

  // Handle Back key inside PIN or Keyboard modal
  useEffect(() => {
    if (!editingField && !(selectedProfile && selectedProfile.hasPin)) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009 || e.keyCode === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (editingField) {
          const field = editingField;
          setEditingField(null);
          setTimeout(() => {
            if (field === 'email') emailBoxRef.current?.focus();
            else passwordBoxRef.current?.focus();
          }, 60);
          return;
        }

        if (selectedProfile && selectedProfile.hasPin) {
          setSelectedProfile(null);
          setPinDigits([]);
          setPinError('');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [editingField, selectedProfile]);

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
    if (editingField === 'email') {
      setEmail((prev) => prev + char);
    } else if (editingField === 'password') {
      setPassword((prev) => prev + char);
    }
    setError('');
  };

  const handleKeyboardBackspace = () => {
    if (editingField === 'email') {
      setEmail((prev) => prev.slice(0, -1));
    } else if (editingField === 'password') {
      setPassword((prev) => prev.slice(0, -1));
    }
    setError('');
  };

  const handleKeyboardClear = () => {
    if (editingField === 'email') {
      setEmail('');
    } else if (editingField === 'password') {
      setPassword('');
    }
    setError('');
  };

  const showProfilesMode = isLan && profiles.length > 0 && !showPasswordForm;

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between px-4 py-4 sm:py-6 bg-[#07080c] text-white overflow-hidden select-none">
      {/* Cinematic Ambient Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-amber-500/[0.08] rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-orange-600/[0.05] rounded-full blur-[100px]" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-4xl flex items-center justify-between px-2">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-6 w-6 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/50 to-amber-600/30 blur-sm opacity-70" />
            <div className="relative h-2 w-2 rounded-full bg-gradient-to-br from-amber-100 to-amber-500 shadow-sm" />
          </div>
          <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-white/90">Lumière</span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {showPasswordForm && profiles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(false);
                setSelectedProfile(null);
                setEditingField(null);
                setError('');
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] focus:ring-2 focus:ring-amber-400 border border-white/10 text-xs font-medium text-amber-300 transition-all outline-none cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>К профилям</span>
            </button>
          )}

          <button
            type="button"
            onClick={changeServer}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] focus:ring-2 focus:ring-amber-400 border border-white/10 text-xs text-white/70 hover:text-white transition-all outline-none cursor-pointer"
            title="Сменить медиасервер"
          >
            <Server className="h-3 w-3 text-amber-300/80" />
            <span className="font-mono text-[11px] text-white/80">{getServerUrl().replace(/^https?:\/\//, '') || 'Сервер не выбран'}</span>
            <span className="text-[10px] text-amber-300/70 font-semibold ml-0.5">Сменить</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-2">
        {/* Screen 1: Profile Selection Mode ("Кто смотрит?") */}
        {showProfilesMode && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-fade-in">
            <div className="text-center mb-6">
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400/80">Медиацентр</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-0.5">
                Кто смотрит?
              </h1>
              <p className="text-xs text-white/45 mt-1">
                Выберите профиль для быстрого входа
              </p>
            </div>

            {/* Profiles Grid */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6 max-w-xl">
              {profiles.map((p, idx) => {
                const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                const palette = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProfileSelect(p)}
                    className="group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all focus:scale-105 outline-none cursor-pointer"
                  >
                    <div
                      className={`relative flex h-20 w-20 sm:h-22 sm:w-22 items-center justify-center rounded-2xl bg-gradient-to-br ${palette.bg} border ${palette.border} shadow-lg transition-all group-hover:scale-105 group-focus:ring-2 group-focus:ring-amber-400 group-focus:border-amber-300 group-focus:shadow-[0_0_20px_rgba(251,191,36,0.3)]`}
                    >
                      {p.avatar ? (
                        <img
                          src={p.avatar}
                          alt={p.name}
                          className="h-full w-full rounded-2xl object-cover"
                        />
                      ) : (
                        <div className={`text-2xl sm:text-3xl font-bold ${palette.text}`}>
                          {initial}
                        </div>
                      )}

                      {/* Badges on Avatar */}
                      {p.hasPin && (
                        <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-amber-300 shadow">
                          <Lock className="h-2.5 w-2.5" />
                        </div>
                      )}
                      {p.isKids && (
                        <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/30 backdrop-blur-md border border-purple-400/20 text-purple-200 shadow">
                          <Baby className="h-2.5 w-2.5" />
                        </div>
                      )}
                    </div>

                    <div className="text-center">
                      <div className="text-xs sm:text-sm font-semibold text-white/90 group-hover:text-white group-focus:text-amber-300 transition-colors truncate max-w-[90px]">
                        {p.name}
                      </div>
                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        {p.role === 'admin' && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-amber-300/90 bg-amber-400/15 px-1.5 py-0.2 rounded-full border border-amber-400/20">
                            Админ
                          </span>
                        )}
                        {p.isKids && (
                          <span className="text-[9px] uppercase tracking-wider font-bold text-purple-300/90 bg-purple-400/15 px-1.5 py-0.2 rounded-full border border-purple-400/20">
                            Детский
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom link: password login */}
            <button
              type="button"
              onClick={() => {
                setSelectedProfile(null);
                setEmail('');
                setPassword('');
                setShowPasswordForm(true);
              }}
              className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white focus:text-amber-300 focus:ring-2 focus:ring-amber-400 transition-all py-1.5 px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 outline-none cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-amber-300/80" />
              <span>Войти по логину и паролю</span>
            </button>
          </div>
        )}

        {/* Screen 2: Compact Password Login Form */}
        {(!showProfilesMode || showPasswordForm) && (
          <div className="w-full max-w-[360px] animate-fade-in flex flex-col items-center">
            {/* Login Card */}
            <div className="w-full bg-[#0d0f17]/90 border border-white/[0.1] rounded-2xl p-4 sm:p-5 backdrop-blur-2xl shadow-2xl">
              <div className="text-center mb-4">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {selectedProfile ? `Вход: ${selectedProfile.name}` : 'Вход в аккаунт'}
                </h2>
                <p className="text-[11px] text-white/50 mt-0.5">
                  {selectedProfile ? selectedProfile.email : 'Нажмите на поле для ввода'}
                </p>
              </div>

              {error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-500/25 p-2.5 text-xs text-rose-300 animate-fade-in">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2.5">
                {/* Email Box */}
                <div
                  ref={emailBoxRef}
                  tabIndex={0}
                  role="button"
                  aria-label="Ввести email или логин"
                  onClick={() => setEditingField('email')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditingField('email');
                    }
                  }}
                  className="rounded-xl p-2.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 focus:bg-white/[0.08] transition-all cursor-pointer outline-none"
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-amber-300" />
                      Email / Логин
                    </span>
                    <span className="text-[9px] text-amber-300/80 font-medium">Нажмите для ввода ✍</span>
                  </div>
                  <div className="font-mono text-xs sm:text-[13px] text-white font-medium truncate min-h-[18px]">
                    {email || <span className="text-white/30 font-normal">your@email.com</span>}
                  </div>
                </div>

                {/* Password Box */}
                <div
                  ref={passwordBoxRef}
                  tabIndex={0}
                  role="button"
                  aria-label="Ввести пароль"
                  onClick={() => setEditingField('password')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditingField('password');
                    }
                  }}
                  className="rounded-xl p-2.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 focus:bg-white/[0.08] transition-all cursor-pointer outline-none"
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3 text-amber-300" />
                      Пароль
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPassword(!showPassword);
                        }}
                        className="text-white/40 hover:text-white p-0.5 rounded outline-none"
                        title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      >
                        {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <span className="text-[9px] text-amber-300/80 font-medium">Нажмите для ввода ✍</span>
                    </div>
                  </div>
                  <div className="font-mono text-xs sm:text-[13px] text-white font-medium truncate min-h-[18px]">
                    {password ? (
                      showPassword ? password : '••••••••'.slice(0, Math.min(password.length, 12)) || '••••'
                    ) : (
                      <span className="text-white/30 font-normal">Введите пароль</span>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading || !email.trim() || !password.trim()}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-black font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 hover:brightness-110 focus:scale-[1.02] focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-40 transition-all outline-none cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-black" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-black" />
                  )}
                  <span>{loading ? 'Проверка...' : 'Войти'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PIN Entry Modal */}
        {selectedProfile && selectedProfile.hasPin && (
          <div
            role="dialog"
            aria-modal="true"
            data-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
          >
            <div className="w-full max-w-[270px] rounded-2xl bg-[#0f1118]/95 border border-white/15 p-5 flex flex-col items-center shadow-2xl backdrop-blur-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/25 text-xl font-bold text-amber-200 mb-2">
                {selectedProfile.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-sm font-semibold text-white/95">{selectedProfile.name}</h3>
              <p className="text-[11px] text-white/45 mb-4">Введите 4-значный PIN-код</p>

              {/* 4 PIN Dots */}
              <div className="flex gap-3 mb-4">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = idx < pinDigits.length;
                  return (
                    <div
                      key={idx}
                      className={`h-3 w-3 rounded-full transition-all duration-200 ${
                        filled
                          ? 'bg-amber-300 scale-110 shadow-[0_0_10px_rgba(252,211,77,0.7)]'
                          : 'bg-white/10 border border-white/20'
                      }`}
                    />
                  );
                })}
              </div>

              {pinError && (
                <div className="mb-3 text-xs text-rose-400 text-center font-medium">
                  {pinError}
                </div>
              )}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-1.5 w-full max-w-[220px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handlePinDigit(digit)}
                    disabled={pinLoading}
                    className="flex h-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-base font-bold text-white/90 transition-all hover:bg-white/[0.12] focus:scale-105 focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-50 outline-none cursor-pointer"
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
                  className="flex h-10 items-center justify-center rounded-xl text-xs font-medium text-white/50 hover:text-white focus:ring-2 focus:ring-amber-400 transition-colors outline-none cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit('0')}
                  disabled={pinLoading}
                  className="flex h-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-base font-bold text-white/90 transition-all hover:bg-white/[0.12] focus:scale-105 focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-50 outline-none cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handlePinBackspace}
                  disabled={pinLoading || pinDigits.length === 0}
                  className="flex h-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-amber-300 transition-all hover:bg-white/[0.12] focus:scale-105 focus:bg-amber-400 focus:text-black focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-30 outline-none cursor-pointer"
                  title="Стереть цифру"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Screen 4: On-Screen TV Keyboard Modal (appears ONLY when user clicks an input field!) */}
        {editingField && (
          <div
            role="dialog"
            aria-modal="true"
            data-modal="true"
            className="fixed inset-0 z-50 flex flex-col items-center justify-end sm:justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          >
            <div className="w-full max-w-[520px] rounded-2xl bg-[#0b0d14]/95 border border-white/15 p-3 sm:p-4 shadow-2xl backdrop-blur-2xl flex flex-col gap-2">
              {/* Preview Bar */}
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/[0.07]">
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <span>Ввод:</span>
                  <span className="font-bold text-amber-300 font-mono text-[11px] bg-amber-400/15 px-2 py-0.5 rounded border border-amber-400/25">
                    {editingField === 'email' ? 'Email / Логин' : 'Пароль'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {editingField === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-white/70 hover:text-white flex items-center gap-1 border border-white/[0.08] outline-none"
                    >
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      <span>{showPassword ? 'Скрыть' : 'Показать'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setEditingField(editingField === 'email' ? 'password' : 'email')}
                    className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-amber-300/80 hover:text-amber-200 border border-white/[0.08] outline-none cursor-pointer"
                  >
                    ⇄ {editingField === 'email' ? 'Пароль' : 'Email'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const field = editingField;
                      setEditingField(null);
                      setTimeout(() => {
                        if (field === 'email') emailBoxRef.current?.focus();
                        else passwordBoxRef.current?.focus();
                      }, 60);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-400 text-black font-bold text-xs hover:bg-amber-300 transition-all outline-none cursor-pointer shadow-sm shadow-amber-400/20"
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                    <span>Готово</span>
                  </button>
                </div>
              </div>

              {/* Active Value Box with cursor */}
              <div className="h-9 px-3 flex items-center rounded-xl bg-white/[0.04] border border-amber-400/40 text-xs sm:text-[13px] font-mono text-white shadow-inner truncate">
                {editingField === 'email' ? (
                  email ? (
                    <>
                      <span>{email}</span>
                      <span className="inline-block w-0.5 h-3.5 bg-amber-300 animate-pulse ml-0.5" />
                    </>
                  ) : (
                    <span className="text-white/30 font-normal">Введите email...</span>
                  )
                ) : (
                  password ? (
                    <>
                      <span>{showPassword ? password : '••••••••'.slice(0, Math.min(password.length, 16)) || '••••'}</span>
                      <span className="inline-block w-0.5 h-3.5 bg-amber-300 animate-pulse ml-0.5" />
                    </>
                  ) : (
                    <span className="text-white/30 font-normal">Введите пароль...</span>
                  )
                )}
              </div>

              {/* The Compact TV Keyboard */}
              <TvKeyboard
                onInput={handleKeyboardInput}
                onBackspace={handleKeyboardBackspace}
                onClear={handleKeyboardClear}
                onSubmit={() => {
                  if (editingField === 'email') {
                    setEditingField('password');
                  } else {
                    setEditingField(null);
                    handleSubmit();
                  }
                }}
                submitLabel={editingField === 'email' ? 'Далее' : 'Войти'}
                presets={
                  editingField === 'email'
                    ? ['@gmail.com', '@yandex.ru', '@mail.ru', '.ru', '.com']
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer copyright / subtle version */}
      <footer className="relative z-10 text-[10px] text-white/20 text-center py-1">
        Lumière Cinema Suite
      </footer>
    </div>
  );
}
