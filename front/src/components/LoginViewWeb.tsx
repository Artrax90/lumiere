import { useState } from 'react';
import { useAuth, type Profile } from '@/contexts/AuthContext';
import { getServerUrl } from '@/api/server';
import { Eye, EyeOff, Server, AlertCircle, Loader2, Sparkles, User, KeyRound, Lock, Baby } from 'lucide-react';

const AVATAR_PALETTES = [
  { bg: 'from-amber-400/25 via-amber-500/15 to-orange-600/25', border: 'border-amber-400/30', text: 'text-amber-200' },
  { bg: 'from-cyan-400/25 via-blue-500/15 to-indigo-600/25', border: 'border-cyan-400/30', text: 'text-cyan-200' },
  { bg: 'from-emerald-400/25 via-teal-500/15 to-cyan-600/25', border: 'border-emerald-400/30', text: 'text-emerald-200' },
  { bg: 'from-rose-400/25 via-pink-500/15 to-purple-600/25', border: 'border-rose-400/30', text: 'text-rose-200' },
  { bg: 'from-violet-400/25 via-purple-500/15 to-indigo-600/25', border: 'border-violet-400/30', text: 'text-violet-200' },
];

export default function LoginViewWeb() {
  const { login, quickLogin, isLan, profiles, changeServer } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick PIN modal for profiles with PIN
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Заполните email и пароль');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Неверный логин или пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProfile = (p: Profile) => {
    if (p.hasPin) {
      setPinProfile(p);
      setPin('');
      setPinError('');
    } else {
      setEmail(p.email);
      setError('');
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinProfile || pin.length !== 4) return;
    setPinLoading(true);
    setPinError('');
    try {
      await quickLogin(pinProfile.id, pin);
    } catch (err: any) {
      setPinError(err.message || 'Неверный PIN-код');
      setPin('');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between px-4 py-6 bg-[#07080c] text-white overflow-hidden">
      {/* Cinematic Ambient Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-amber-500/[0.08] rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-600/[0.05] rounded-full blur-[120px]" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-4xl flex items-center justify-between px-2">
        {/* Left: Brand */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/50 to-amber-600/30 blur-sm opacity-70" />
            <div className="relative h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-100 to-amber-500 shadow-sm" />
          </div>
          <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-white/90">Lumière</span>
        </div>

        {/* Right: Server badge / changer */}
        <button
          type="button"
          onClick={changeServer}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] focus:ring-2 focus:ring-amber-400 border border-white/10 text-xs text-white/70 hover:text-white transition-all outline-none cursor-pointer"
          title="Сменить медиасервер"
        >
          <Server className="h-3.5 w-3.5 text-amber-300/80" />
          <span className="font-mono text-[11px] text-white/80">{getServerUrl().replace(/^https?:\/\//, '')}</span>
          <span className="text-[10px] text-amber-300/80 font-semibold ml-0.5">Сменить</span>
        </button>
      </header>

      {/* Main Form Center */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-6">
        <div className="w-full max-w-md animate-fade-in">
          {/* Card */}
          <div className="w-full bg-[#0d0f17]/90 border border-white/[0.1] rounded-2xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl">
            {/* Title */}
            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Войдите в свой аккаунт
              </h1>
              <p className="text-xs sm:text-sm text-white/50 mt-1">
                Для доступа к персональной медиатеке и синхронизации
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-500/15 border border-rose-500/25 p-3 text-xs sm:text-sm text-rose-300 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Native Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email / Username field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-amber-300" />
                  <span>Email или логин</span>
                </label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoFocus
                  className="w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.07] border border-white/[0.1] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 focus:bg-white/[0.08] px-3.5 py-2.5 text-sm sm:text-base text-white placeholder:text-white/30 transition-all outline-none"
                />
              </div>

              {/* Password field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-amber-300" />
                    <span>Пароль</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    required
                    className="w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.07] border border-white/[0.1] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 focus:bg-white/[0.08] px-3.5 py-2.5 pr-11 text-sm sm:text-base text-white placeholder:text-white/30 transition-all outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 rounded-md transition-colors outline-none cursor-pointer"
                    title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || !email.trim() || !password.trim()}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-black font-bold text-sm sm:text-base shadow-lg shadow-amber-500/20 hover:brightness-110 focus:scale-[1.01] focus:ring-2 focus:ring-amber-300 active:scale-95 disabled:opacity-40 transition-all outline-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-black" />
                    <span>Вход...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-black" />
                    <span>Войти</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Profile Selection row (if profiles discovered on LAN) */}
            {isLan && profiles.length > 0 && (
              <div className="mt-6 pt-5 border-t border-white/[0.08]">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-white/40 text-center mb-3">
                  Быстрый вход по профилю
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {profiles.map((p, idx) => {
                    const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                    const palette = AVATAR_PALETTES[idx % AVATAR_PALETTES.length];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProfile(p)}
                        className="group flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] hover:border-amber-400/40 transition-all cursor-pointer outline-none"
                        title={p.hasPin ? `${p.name} (Вход по PIN)` : `${p.name} (${p.email})`}
                      >
                        <div className={`relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${palette.bg} border ${palette.border}`}>
                          {p.avatar ? (
                            <img src={p.avatar} alt={p.name} className="h-full w-full rounded-lg object-cover" />
                          ) : (
                            <span className={`text-xs font-bold ${palette.text}`}>{initial}</span>
                          )}
                          {p.hasPin && (
                            <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/90 text-amber-300">
                              <Lock className="h-2 w-2" />
                            </div>
                          )}
                          {p.isKids && (
                            <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-500/80 text-white">
                              <Baby className="h-2 w-2" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-white/80 group-hover:text-amber-300 font-medium transition-colors">
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* PIN Modal for profile quick login */}
      {pinProfile && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in"
        >
          <div className="w-full max-w-xs rounded-2xl bg-[#0f1118]/95 border border-white/15 p-6 flex flex-col items-center shadow-2xl backdrop-blur-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/25 text-xl font-bold text-amber-200 mb-2">
              {pinProfile.name.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-base font-semibold text-white/95">{pinProfile.name}</h3>
            <p className="text-xs text-white/45 mb-4">Введите 4-значный PIN-код</p>

            {pinError && (
              <div className="mb-3 text-xs text-rose-400 text-center font-medium">
                {pinError}
              </div>
            )}

            <form onSubmit={handlePinSubmit} className="w-full flex flex-col items-center gap-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                  setPinError('');
                  if (val.length === 4) {
                    setPinLoading(true);
                    quickLogin(pinProfile.id, val)
                      .catch((err: any) => {
                        setPinError(err.message || 'Неверный PIN-код');
                        setPin('');
                      })
                      .finally(() => setPinLoading(false));
                  }
                }}
                placeholder="••••"
                className="w-36 text-center tracking-[0.5em] text-2xl font-mono py-2 rounded-xl bg-white/[0.05] border border-white/[0.15] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 text-white outline-none"
              />

              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setPinProfile(null);
                    setPin('');
                    setPinError('');
                  }}
                  className="flex-1 py-2 text-xs font-medium text-white/60 hover:text-white rounded-xl bg-white/[0.05] border border-white/10 transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pinLoading || pin.length !== 4}
                  className="flex-1 py-2 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-40 rounded-xl transition-colors cursor-pointer"
                >
                  {pinLoading ? 'Вход...' : 'Войти'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer copyright */}
      <footer className="relative z-10 text-[11px] text-white/20 text-center py-2">
        Lumière Cinema Suite
      </footer>
    </div>
  );
}
