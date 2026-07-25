import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

export default function SetupView() {
  const { setupAdmin, inviteCodes } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await setupAdmin(email, password, name);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(inviteCodes.join('\n'));
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  // After setup — show invite codes
  if (inviteCodes.length > 0) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[4px] opacity-60" />
              <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
            </div>
            <span className="text-display text-[24px] font-medium text-white/85">Lumière</span>
          </div>

          <h1 className="text-display text-[28px] font-medium text-white/95 mb-3">Настройка завершена</h1>
          <p className="text-[14px] text-white/45 mb-8">Админ-аккаунт создан. Вот инвайт-коды для друзей:</p>

          <div className="glass-panel rounded-[20px] p-6 space-y-3">
            {inviteCodes.map((code) => (
              <div key={code} className="flex items-center justify-between rounded-[12px] bg-white/[0.04] border border-white/[0.08] px-4 py-3">
                <span className="font-mono text-[16px] font-semibold text-amber-300/90 tracking-wider">{code}</span>
                <button
                  onClick={() => copyCode(code)}
                  className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-cinematic"
                >
                  {copied === code ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  {copied === code ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            ))}

            <button
              onClick={copyAll}
              className="w-full mt-4 rounded-[12px] bg-white/[0.04] border border-white/[0.08] py-2.5 text-[13px] text-white/50 hover:text-white/70 transition-cinematic"
            >
              {copied === 'all' ? 'Все скопировано' : 'Скопировать все'}
            </button>
          </div>

          <p className="mt-6 text-[12px] text-white/30">
            Сохраните эти коды — они понадобятся для регистрации друзей.
          </p>
        </div>
      </div>
    );
  }

  // Setup form
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[4px] opacity-60" />
              <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
            </div>
            <span className="text-display text-[24px] font-medium text-white/85">Lumière</span>
          </div>
          <h1 className="text-display text-[28px] font-medium text-white/95 mb-2">Первый запуск</h1>
          <p className="text-[14px] text-white/45">Создайте админ-аккаунт для управления сервером</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel rounded-[20px] p-8 space-y-5">
          <div>
            <label className="block text-[12px] font-medium text-white/50 mb-2">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              required
              className="w-full rounded-[12px] bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30 transition-cinematic"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-white/50 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
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
                placeholder="Минимум 6 символов"
                required
                minLength={6}
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
            {loading ? 'Создание...' : 'Создать админ-аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}
