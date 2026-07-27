import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-600/30 blur-[4px] opacity-60" />
              <div className="relative h-3 w-3 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
            </div>
            <span className="text-display text-[24px] font-medium text-white/85">Lumière</span>
          </div>
          <p className="text-[14px] text-white/45">Войдите в свой аккаунт</p>
        </div>

        {/* Form */}
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
            {loading ? 'Загрузка...' : 'Войти'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] text-white/20">
          В локальной сети вход происходит автоматически
        </p>
      </div>
    </div>
  );
}
