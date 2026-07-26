import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles, Monitor, Volume2, Captions, Wifi, Puzzle, User, Gamepad2, Code, Info, Moon, Sun, Plus, Trash2, Film, Server, Activity, HardDrive, RefreshCw } from 'lucide-react';
import ActivityHeatmap from './ActivityHeatmap';
import { apiPost, apiDelete } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';

interface SettingsViewProps {
  onClose: () => void;
}

function Play({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth || 1.5}><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" /></svg>;
}

const toggles = [
  { id: 'autoplay', label: 'settings.autoplay', desc: 'settings.autoplayDesc', on: true },
  { id: 'skip-intro', label: 'settings.skipIntro', desc: 'settings.skipIntroDesc', on: true },
  { id: 'hdr', label: 'settings.hdr', desc: 'settings.hdrDesc', on: true },
  { id: 'motion', label: 'settings.motion', desc: 'settings.motionDesc', on: false },
];

interface UserItem {
  id: number;
  email: string;
  name: string;
  avatar: string;
  createdAt: string;
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState('appearance');
  const [toggleState, setToggleState] = useState<Record<string, boolean>>(
    Object.fromEntries(toggles.map((t) => [t.id, t.on]))
  );
  const [theme, setTheme] = useState('dark');
  const [quality, setQuality] = useState('Auto');
  const [language, setLanguage] = useState(i18n.language || 'ru');

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userError, setUserError] = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lumiere_access')}` },
      });
      if (!res.ok) {
        setUsersLoaded(true);
        return;
      }
      const data = await res.json();
      setUsers(data.users);
      setUsersLoaded(true);
    } catch {
      setUsersLoaded(true);
    }
  };

  useEffect(() => {
    if (active === 'accounts' && !usersLoaded) {
      loadUsers();
    }
  }, [active, usersLoaded]);

  const isAdmin = users.length > 0 && user && user.id === users[0]?.id;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    setUserLoading(true);
    try {
      await apiPost('/api/admin/users', {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      await loadUsers();
    } catch (err: any) {
      setUserError(err.message);
    } finally {
      setUserLoading(false);
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await apiDelete(`/api/admin/users/${id}`);
      await loadUsers();
    } catch (err: any) {
      setUserError(err.message);
    }
  };

  const changeLanguage = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('lumiere_lang', lang);
  };

  const categories = [
    { id: 'appearance', label: t('settings.appearance'), desc: t('settings.appearanceDesc'), icon: Monitor },
    { id: 'playback', label: t('settings.playback'), desc: t('settings.playbackDesc'), icon: Play },
    { id: 'audio', label: t('settings.audio'), desc: t('settings.audioDesc'), icon: Volume2 },
    { id: 'subtitles', label: t('settings.subtitles'), desc: t('settings.subtitlesDesc'), icon: Captions },
    { id: 'network', label: t('settings.network'), desc: t('settings.networkDesc'), icon: Wifi },
    { id: 'plugins', label: t('settings.plugins'), desc: t('settings.pluginsDesc'), icon: Puzzle },
    { id: 'accounts', label: t('settings.accounts'), desc: t('settings.accountsDesc'), icon: User },
    { id: 'activity', label: t('settings.activity'), desc: t('settings.activityDesc'), icon: Film },
    { id: 'remote', label: t('settings.remote'), desc: t('settings.remoteDesc'), icon: Gamepad2 },
    { id: 'developer', label: t('settings.developer'), desc: t('settings.developerDesc'), icon: Code },
    { id: 'about', label: t('settings.about'), desc: t('settings.aboutDesc'), icon: Info },
  ];

  return (
    <div className="min-h-screen w-full px-8 pt-28 pb-20 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 animate-row-reveal">
          <h1 className="text-display text-[36px] font-medium tracking-tight text-white/95 md:text-[44px]">{t('settings.title')}</h1>
          <p className="mt-2 text-[15px] text-white/50">{t('settings.subtitle')}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <div className="space-y-1 animate-row-reveal">
            {categories.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className="group flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left transition-cinematic"
                  style={{ background: active === c.id ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 transition-cinematic ${active === c.id ? 'text-amber-300/80' : 'text-white/35'}`} strokeWidth={1.5} />
                    <div>
                      <div className="text-[14px] font-medium transition-cinematic" style={{ color: active === c.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)' }}>{c.label}</div>
                      <div className="mt-0.5 text-[11px] text-white/35">{c.desc}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 transition-cinematic" style={{ opacity: active === c.id ? 1 : 0, color: 'rgba(232,193,112,0.7)' }} strokeWidth={1.5} />
                </button>
              );
            })}
          </div>

          <div className="glass-panel rounded-[20px] p-8 animate-detail-rise" style={{ animationDelay: '100ms' }}>
            <h2 className="text-display text-[22px] font-medium text-white/90">{categories.find((c) => c.id === active)?.label}</h2>

            {/* Appearance */}
            {active === 'appearance' && (
              <div className="mt-8 space-y-6">
                <div>
                  <div className="mb-3 text-[13px] font-medium text-white/70">{t('settings.theme')}</div>
                  <div className="flex gap-2">
                    {[
                      { id: 'dark', label: t('settings.dark'), icon: Moon },
                      { id: 'light', label: t('settings.light'), icon: Sun },
                      { id: 'auto', label: t('settings.autoTheme'), icon: Monitor },
                    ].map((th) => {
                      const TIcon = th.icon;
                      return (
                        <button
                          key={th.id}
                          onClick={() => setTheme(th.id)}
                          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-cinematic"
                          style={{
                            background: theme === th.id ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                            color: theme === th.id ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                            border: theme === th.id ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <TIcon className="h-3.5 w-3.5" strokeWidth={1.5} />{th.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Language switcher */}
                <div className="border-t border-white/[0.06] pt-6">
                  <div className="mb-3 text-[13px] font-medium text-white/70">{t('settings.language')}</div>
                  <div className="flex gap-2">
                    {[
                      { id: 'ru', label: 'Русский' },
                      { id: 'en', label: 'English' },
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => changeLanguage(lang.id)}
                        className="rounded-full px-5 py-2.5 text-[13px] font-medium transition-cinematic"
                        style={{
                          background: language === lang.id ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                          color: language === lang.id ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                          border: language === lang.id ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-white/[0.06] pt-6">
                  <div className="mb-3 text-[13px] font-medium text-white/70">{t('settings.accentColor')}</div>
                  <div className="flex gap-2.5">
                    {['rgba(232,193,112,0.9)', 'rgba(110,150,255,0.9)', 'rgba(244,114,182,0.9)', 'rgba(100,200,150,0.9)', 'rgba(200,120,60,0.9)'].map((c, i) => (
                      <button key={i} className="h-8 w-8 rounded-full transition-cinematic hover:scale-110" style={{ background: c, border: i === 0 ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent' }} aria-label={`Accent ${i}`} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Playback */}
            {active === 'playback' && (
              <div className="mt-8 space-y-1">
                {toggles.map((toggle) => (
                  <ToggleRow
                    key={toggle.id}
                    label={t(toggle.label)}
                    desc={t(toggle.desc)}
                    on={toggleState[toggle.id]}
                    onChange={() => setToggleState((p) => ({ ...p, [toggle.id]: !p[toggle.id] }))}
                  />
                ))}
                <div className="mt-6 border-t border-white/[0.06] pt-6">
                  <div className="mb-3 text-[13px] font-medium text-white/70">{t('common.quality')}</div>
                  <div className="flex gap-2">
                    {['Auto', '4K', '1080p', '720p'].map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuality(q)}
                        className="rounded-full px-4 py-2 text-[12px] font-medium transition-cinematic"
                        style={{
                          background: quality === q ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                          color: quality === q ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                          border: quality === q ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Accounts / Users */}
            {active === 'accounts' && (
              <div className="mt-8 space-y-6">
                {!usersLoaded ? (
                  <div className="flex items-center gap-3 text-[13px] text-white/50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                    {t('common.loading')}
                  </div>
                ) : isAdmin ? (
                  <>
                    <p className="text-[13px] text-white/50">{t('settings.accountsDesc')}</p>

                    {/* Create user form */}
                    <form onSubmit={handleCreateUser} className="space-y-4 rounded-[14px] border border-white/[0.06] p-5">
                      <div className="text-[14px] font-medium text-white/85">{t('settings.newUser')}</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="text"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder={t('settings.name')}
                          required
                          className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30"
                        />
                        <input
                          type="email"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="Email"
                          required
                          className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30"
                        />
                      </div>
                      <div className="flex gap-3">
                        <input
                          type="password"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          placeholder={t('settings.password')}
                          required
                          minLength={6}
                          className="flex-1 rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30"
                        />
                        <button
                          type="submit"
                          disabled={userLoading}
                          className="flex items-center gap-2 rounded-[10px] bg-amber-300/90 px-5 py-2.5 text-[13px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />{t('settings.create')}
                        </button>
                      </div>
                      {userError && (
                        <div className="text-[12px] text-red-400/80">{userError}</div>
                      )}
                    </form>

                    {/* Users list */}
                    <div className="space-y-2">
                      <div className="text-[13px] font-medium text-white/70">{t('settings.users')} ({users.length})</div>
                      {users.map((u, i) => (
                        <div key={u.id} className="flex items-center justify-between rounded-[12px] bg-white/[0.03] border border-white/[0.05] px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-200/70 to-amber-600/40 text-[12px] font-semibold text-black/60">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-[13px] font-medium text-white/85">{u.name}</div>
                              <div className="text-[11px] text-white/40">{u.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {i === 0 && (
                              <span className="text-[10px] font-medium text-amber-300/70 bg-amber-300/10 px-2 py-0.5 rounded-full">Admin</span>
                            )}
                            {i > 0 && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="text-white/30 hover:text-red-400/80 transition-cinematic"
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[14px] text-white/50">{t('settings.adminOnly')}</p>
                )}
              </div>
            )}

            {/* Plugins / Services */}
            {active === 'plugins' && (
              <div className="mt-6 space-y-6">
                {/* JacRed */}
                <JacRedConfig />
                {/* TorrServer */}
                <ServiceCard
                  name="TorrServer"
                  desc="Стриминг торрентов без скачивания"
                  icon="📡"
                  url="http://localhost:8090"
                  statusUrl="/api/torrents/torrserver/status"
                />
                {/* qBittorrent */}
                <ServiceCard
                  name="qBittorrent"
                  desc="Менеджер загрузки торрентов"
                  icon="⬇️"
                  url="http://localhost:6003"
                />
                {/* Online Providers */}
                <div className="rounded-[14px] border border-white/[0.06] p-5">
                  <div className="text-[14px] font-medium text-white/85 mb-3">{t('settings.onlineProviders')}</div>
                  <div className="space-y-2">
                    {[
                      { name: 'Collaps', status: true },
                      { name: 'HDVB', status: true },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center justify-between py-2">
                        <span className="text-[13px] text-white/70">{p.name}</span>
                        <span className={`text-[11px] ${p.status ? 'text-green-400/70' : 'text-white/30'}`}>
                          {p.status ? t('settings.active') : t('settings.disabled')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Activity Monitor */}
            {active === 'activity' && (
              <div className="mt-6 space-y-6">
                <ActivityHeatmap />
                <ActivityMonitor />
              </div>
            )}

            {/* Audio Settings */}
            {active === 'audio' && (
              <div className="mt-8 space-y-1">
                {[
                  { label: 'Автоматический выбор лучшей дорожки', desc: 'Выбирать дорожку с наилучшим качеством', on: true },
                  { label: 'Нормализация громкости', desc: 'Выравнивать громкость между дорожками', on: false },
                  { label: 'Surround звук', desc: 'Включить многоканальный звук если поддерживается', on: true },
                ].map((t) => (
                  <ToggleRow key={t.label} label={t.label} desc={t.desc} on={t.on} onChange={() => {}} />
                ))}
              </div>
            )}

            {/* Subtitles Settings */}
            {active === 'subtitles' && (
              <div className="mt-8 space-y-6">
                <div>
                  <div className="mb-3 text-[13px] font-medium text-white/70">Язык субтитров</div>
                  <div className="flex gap-2">
                    {['Русский', 'Английский', 'Авто'].map((lang) => (
                      <button
                        key={lang}
                        className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
                        style={{
                          background: lang === 'Авто' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                          color: lang === 'Авто' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                          border: lang === 'Авто' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
                {[
                  { label: 'Показывать субтитры по умолчанию', desc: 'Автоматически включать субтитры при воспроизведении', on: false },
                  { label: 'Субтитры для слабослышащих', desc: 'Включить описания звуков и эффектов', on: false },
                ].map((t) => (
                  <ToggleRow key={t.label} label={t.label} desc={t.desc} on={t.on} onChange={() => {}} />
                ))}
                <div>
                  <div className="mb-3 text-[13px] font-medium text-white/70">Размер субтитров</div>
                  <div className="flex gap-2">
                    {['Маленький', 'Средний', 'Большой'].map((size) => (
                      <button
                        key={size}
                        className="rounded-full px-4 py-2 text-[13px] font-medium transition-cinematic"
                        style={{
                          background: size === 'Средний' ? 'rgba(232,193,112,0.15)' : 'rgba(255,255,255,0.04)',
                          color: size === 'Средний' ? 'rgba(232,193,112,0.95)' : 'rgba(255,255,255,0.6)',
                          border: size === 'Средний' ? '1px solid rgba(232,193,112,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Network Settings */}
            {active === 'network' && (
              <div className="mt-8 space-y-1">
                {[
                  { label: 'Автоматическое качество', desc: 'Подстраивать качество под скорость интернета', on: true },
                  { label: 'Предзагрузка', desc: 'Загружать следующую серию заранее', on: true },
                  { label: 'Использовать прокси', desc: 'Маршрутизировать трафик через прокси-сервер', on: false },
                ].map((t) => (
                  <ToggleRow key={t.label} label={t.label} desc={t.desc} on={t.on} onChange={() => {}} />
                ))}
              </div>
            )}

            {/* Remote Control Settings */}
            {active === 'remote' && (
              <div className="mt-8 space-y-1">
                {[
                  { label: 'Удалённое управление', desc: 'Разрешить управление с других устройств', on: true },
                  { label: 'Голосовое управление', desc: 'Использовать голосовые команды', on: false },
                  { label: 'Жесты на тачпаде', desc: 'Управление жестами на тачпаде или экране', on: true },
                ].map((t) => (
                  <ToggleRow key={t.label} label={t.label} desc={t.desc} on={t.on} onChange={() => {}} />
                ))}
              </div>
            )}

            {/* Developer Settings */}
            {active === 'developer' && (
              <div className="mt-8 space-y-6">
                {/* Server Status */}
                <ServerStatus />

                {/* API Endpoints */}
                <div>
                  <div className="mb-3 text-[13px] font-medium text-white/70">API эндпоинты</div>
                  <div className="space-y-2">
                    {[
                      { label: 'Backend API', value: 'http://192.168.1.37:3000' },
                      { label: 'JacRed API', value: 'http://ns3bg91xvuqfvq9h.cfhttp.top' },
                      { label: 'TorrServer', value: 'http://localhost:8090' },
                      { label: 'qBittorrent', value: 'http://localhost:6003' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between rounded-[10px] bg-white/[0.03] border border-white/[0.05] px-4 py-3">
                        <span className="text-[13px] text-white/70">{item.label}</span>
                        <span className="text-[12px] text-white/40 font-mono">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FFmpeg Sessions */}
                <FFmpegSessions />

                {/* Cache Management */}
                <CacheManagement />

                {[
                  { label: 'Режим разработчика', desc: 'Показывать дополнительную информацию для отладки', on: false },
                  { label: 'Логирование', desc: 'Сохранять логи приложения', on: false },
                ].map((t) => (
                  <ToggleRow key={t.label} label={t.label} desc={t.desc} on={t.on} onChange={() => {}} />
                ))}
              </div>
            )}

            {/* About */}
            {active === 'about' && (
              <div className="mt-8 space-y-4">
                <div className="rounded-[14px] border border-white/[0.06] p-5">
                  <div className="text-[16px] font-medium text-white/90 mb-2">Lumière</div>
                  <div className="text-[13px] text-white/50">Версия 1.0.0</div>
                  <div className="text-[13px] text-white/50 mt-1">Современный медиацентр</div>
                </div>
                <div className="rounded-[14px] border border-white/[0.06] p-5">
                  <div className="text-[13px] font-medium text-white/70 mb-3">Стек технологий</div>
                  <div className="flex flex-wrap gap-2">
                    {['React', 'TypeScript', 'Fastify', 'PostgreSQL', 'FFmpeg', 'hls.js', 'Tailwind CSS'].map((tech) => (
                      <span key={tech} className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-white/50">{tech}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Default fallback */}
            {!['appearance', 'playback', 'audio', 'subtitles', 'network', 'plugins', 'accounts', 'activity', 'remote', 'developer', 'about'].includes(active) && (
              <div className="mt-8">
                <p className="text-[14px] leading-relaxed text-white/55">
                  Настройки «{categories.find((c) => c.id === active)?.label}» появятся здесь.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, on, onChange }: { label: string; desc?: string; on: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-[14px] font-medium text-white/85">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] text-white/35">{desc}</div>}
      </div>
      <button
        onClick={onChange}
        className="relative h-7 w-12 rounded-full transition-cinematic"
        style={{ background: on ? 'rgba(232,193,112,0.85)' : 'rgba(255,255,255,0.12)' }}
        aria-label={label}
      >
        <span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300" style={{ left: on ? '24px' : '4px' }} />
      </button>
    </div>
  );
}

function ServiceCard({ name, desc, icon, url, statusUrl }: { name: string; desc: string; icon: string; url: string; statusUrl?: string }) {
  const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading');
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    if (!statusUrl) {
      setStatus('online');
      return;
    }
    const check = async () => {
      try {
        const res = await fetch(statusUrl);
        const data = await res.json();
        setDetails(data);
        setStatus(data.online ? 'online' : 'offline');
      } catch {
        setStatus('offline');
      }
    };
    check();
  }, [statusUrl]);

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/5 text-[20px]">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[14px] font-medium text-white/85">{name}</div>
            <div className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-green-400' : status === 'offline' ? 'bg-red-400/60' : 'bg-white/20 animate-pulse'}`} />
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">{desc}</div>
          {details?.version && (
            <div className="mt-1 text-[11px] text-white/30">Версия: {details.version}</div>
          )}
          {details?.indexers && (
            <div className="mt-1 text-[11px] text-white/30">Индексеров: {details.indexers.length}</div>
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/50 transition-cinematic hover:bg-white/[0.1] hover:text-white/80"
        >
          Открыть
        </a>
      </div>
    </div>
  );
}

const JACRED_SERVERS = [
  { url: 'http://ns3bg91xvuqfvq9h.cfhttp.top', name: 'Основной (ns3bg91xvuqfvq9h)' },
  { url: 'http://jacred.xyz', name: 'JacRed XYZ' },
  { url: 'http://jacred.me', name: 'JacRed ME' },
];

function JacRedConfig() {
  const [customUrl, setCustomUrl] = useState('');
  const [selectedUrl, setSelectedUrl] = useState(() => {
    return localStorage.getItem('jacred_url') || JACRED_SERVERS[0].url;
  });
  const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/torrents/jacred/status');
        const data = await res.json();
        setStatus(data.online ? 'online' : 'offline');
      } catch {
        setStatus('offline');
      }
    };
    check();
  }, []);

  const handleSave = async () => {
    const url = customUrl || selectedUrl;
    localStorage.setItem('jacred_url', url);
    try {
      await fetch('/api/torrents/jacred/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    } catch (err) {
      console.error('Failed to update JacRed URL:', err);
    }
  };

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/5 text-[20px]">🔍</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[14px] font-medium text-white/85">JacRed</div>
            <div className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-green-400' : status === 'offline' ? 'bg-red-400/60' : 'bg-white/20 animate-pulse'}`} />
          </div>
          <div className="mt-0.5 text-[11px] text-white/40">Агрегатор торрент-индексаторов</div>
        </div>
      </div>

      {/* Server selection */}
      <div className="space-y-3">
        <div className="text-[12px] font-medium text-white/60">Сервер</div>
        <div className="space-y-2">
          {JACRED_SERVERS.map((server) => (
            <label
              key={server.url}
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="jacred"
                checked={selectedUrl === server.url && !customUrl}
                onChange={() => { setSelectedUrl(server.url); setCustomUrl(''); }}
                className="accent-amber-300"
              />
              <span className="text-[13px] text-white/70">{server.name}</span>
            </label>
          ))}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="jacred"
              checked={!!customUrl}
              onChange={() => setCustomUrl(customUrl || 'http://')}
              className="accent-amber-300"
            />
            <span className="text-[13px] text-white/70">Свой сервер</span>
          </label>
          {customUrl && (
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="http://your-jacred-server.com"
              className="ml-6 w-full rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-amber-300/30"
            />
          )}
        </div>
        <button
          onClick={handleSave}
          className="mt-2 rounded-full bg-amber-300/90 px-4 py-2 text-[12px] font-semibold text-black/80 transition-cinematic hover:bg-amber-200/90"
        >
          Сохранить
        </button>
      </div>

      {/* Status */}
      <div className="mt-4 pt-4 border-t border-white/[0.06]">
        <div className="text-[11px] text-white/30">
          Текущий: {customUrl || selectedUrl}
        </div>
      </div>
    </div>
  );
}

interface Activity {
  userId: number;
  userName: string;
  action: string;
  titleId: number;
  titleName: string;
  timestamp: number;
}

function ActivityMonitor() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const token = localStorage.getItem('lumiere_access');
        const res = await fetch('/api/admin/activity', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        setActivities(data.activities || []);
      } catch {
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
    const interval = setInterval(fetchActivities, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-[13px] text-white/50 py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        Загрузка...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-[13px] text-white/40 py-4">
        Нет активности
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity, i) => (
        <div
          key={`${activity.userId}-${activity.timestamp}-${i}`}
          className="flex items-center gap-3 rounded-[12px] bg-white/[0.03] border border-white/[0.06] p-4"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-[12px] font-semibold text-amber-300">
            {activity.userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-white/85">
              {activity.userName}
            </div>
            <div className="text-[11px] text-white/40">
              {activity.action === 'watching' ? 'Смотрит' : activity.action}: {activity.titleName}
            </div>
          </div>
          <div className="text-[11px] text-white/30 shrink-0">
            {new Date(activity.timestamp).toLocaleTimeString('ru')}
          </div>
        </div>
      ))}
    </div>
  );
}

// Server Status component
function ServerStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('lumiere_access');
        const res = await fetch('/api/admin/server-status', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  if (loading) {
    return (
      <div className="rounded-[14px] border border-white/[0.06] p-5">
        <div className="flex items-center gap-3 text-[13px] text-white/50">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          Загрузка статуса...
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-[14px] border border-white/[0.06] p-5">
        <div className="text-[13px] text-white/40">Статус сервера недоступен</div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Server className="h-4 w-4 text-amber-300/70" />
        <div className="text-[14px] font-medium text-white/85">Статус сервера</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] bg-white/[0.03] p-3">
          <div className="text-[10px] text-white/40 mb-1">Uptime</div>
          <div className="text-[13px] font-medium text-white/85">{status.uptime || '—'}</div>
        </div>
        <div className="rounded-[10px] bg-white/[0.03] p-3">
          <div className="text-[10px] text-white/40 mb-1">Пользователей</div>
          <div className="text-[13px] font-medium text-white/85">{status.users || 0}</div>
        </div>
        <div className="rounded-[10px] bg-white/[0.03] p-3">
          <div className="text-[10px] text-white/40 mb-1">Node.js</div>
          <div className="text-[13px] font-medium text-white/85">{status.nodeVersion || '—'}</div>
        </div>
        <div className="rounded-[10px] bg-white/[0.03] p-3">
          <div className="text-[10px] text-white/40 mb-1">Платформа</div>
          <div className="text-[13px] font-medium text-white/85">{status.platform || '—'}</div>
        </div>
      </div>
      {/* Services status */}
      <div className="mt-4 space-y-2">
        {status.services?.map((svc: any) => (
          <div key={svc.name} className="flex items-center justify-between py-1.5">
            <span className="text-[12px] text-white/60">{svc.name}</span>
            <span className={`text-[11px] ${svc.online ? 'text-green-400/70' : 'text-red-400/60'}`}>
              {svc.online ? 'Online' : 'Offline'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// FFmpeg Sessions component
function FFmpegSessions() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const token = localStorage.getItem('lumiere_access');
        const res = await fetch('/api/admin/ffmpeg-sessions', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-amber-300/70" />
        <div className="text-[14px] font-medium text-white/85">FFmpeg сессии</div>
      </div>
      {loading ? (
        <div className="text-[12px] text-white/40">Загрузка...</div>
      ) : sessions.length === 0 ? (
        <div className="text-[12px] text-white/40">Нет активных сессий</div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div>
                <div className="text-[12px] text-white/70 font-mono">{s.sessionId?.slice(0, 12)}...</div>
                <div className="text-[10px] text-white/40">PID: {s.pid}</div>
              </div>
              <button
                onClick={async () => {
                  const token = localStorage.getItem('lumiere_access');
                  await fetch(`/api/admin/ffmpeg-sessions/${s.sessionId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                  });
                  setSessions(prev => prev.filter((_, idx) => idx !== i));
                }}
                className="text-white/30 hover:text-red-400 transition-cinematic"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cache Management component
function CacheManagement() {
  const [clearing, setClearing] = useState(false);

  const clearCache = async (type: string) => {
    setClearing(true);
    try {
      const token = localStorage.getItem('lumiere_access');
      await fetch(`/api/admin/cache/${type}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="h-4 w-4 text-amber-300/70" />
        <div className="text-[14px] font-medium text-white/85">Управление кешем</div>
      </div>
      <div className="space-y-2">
        <button
          onClick={() => clearCache('hls')}
          disabled={clearing}
          className="flex items-center justify-between w-full rounded-[10px] bg-white/[0.03] hover:bg-white/[0.06] px-4 py-3 transition-cinematic"
        >
          <span className="text-[13px] text-white/70">Очистить HLS сегменты</span>
          <RefreshCw className={`h-3.5 w-3.5 text-white/40 ${clearing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => clearCache('subtitles')}
          disabled={clearing}
          className="flex items-center justify-between w-full rounded-[10px] bg-white/[0.03] hover:bg-white/[0.06] px-4 py-3 transition-cinematic"
        >
          <span className="text-[13px] text-white/70">Очистить кеш субтитров</span>
          <RefreshCw className={`h-3.5 w-3.5 text-white/40 ${clearing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
