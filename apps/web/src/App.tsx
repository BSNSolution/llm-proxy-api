import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Cpu,
  KeyRound,
  LogOut,
  MessagesSquare,
  Settings,
  Users,
  Workflow,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { SetupPage } from './pages/Setup.js';
import { ProxyPage } from './pages/Proxy.js';
import { ChatPage } from './pages/Chat.js';
import { ConfigPage } from './pages/Config.js';
import { UsagePage } from './pages/Usage.js';
import { UsersPage } from './pages/Users.js';
import { RouterPage } from './pages/Router.js';
import { CombosPage } from './pages/Combos.js';
import { LoginPage } from './pages/Login.js';
import { SetupAdminPage } from './pages/SetupAdmin.js';
import { Logo, LogoMark } from './components/logo.js';
import { Tooltip } from './components/ui/tooltip.js';
import { LangSwitch } from './components/lang-switch.js';
import { useT } from './lib/i18n/index.js';
import { cn } from './lib/cn.js';
import { api } from './lib/api.js';

// label/hint são CHAVES i18n (resolvidas na renderização com t()).
type NavItem = { to: string; key: string; icon: LucideIcon; end?: boolean; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: '/', key: 'setup', icon: Cpu, end: true },
  { to: '/proxy', key: 'proxy', icon: KeyRound },
  { to: '/usage', key: 'usage', icon: BarChart3 },
  { to: '/chat', key: 'chat', icon: MessagesSquare },
  { to: '/router', key: 'router', icon: Workflow },
  { to: '/combos', key: 'combos', icon: Layers },
  { to: '/config', key: 'config', icon: Settings },
  { to: '/users', key: 'users', icon: Users, adminOnly: true },
];

/** NAV visível para o papel do usuário atual. */
function navFor(role: string): NavItem[] {
  return NAV.filter((n) => !n.adminOnly || role === 'admin');
}

export function App() {
  const t = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const { pathname } = useLocation();

  async function check() {
    try {
      const { user } = await api.me();
      setEmail(user.email);
      setRole(user.role);
      setNeedsSetup(false);
      setAuthed(true);
    } catch {
      // não autenticado → verifica se é primeiro acesso (precisa criar admin)
      try {
        const { needsSetup } = await api.authStatus();
        setNeedsSetup(needsSetup);
      } catch {
        setNeedsSetup(false);
      }
      setAuthed(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);

  if (authed === null)
    return (
      <div className="grid min-h-dvh place-items-center">
        <LogoMark size={40} />
      </div>
    );
  if (!authed && needsSetup) return <SetupAdminPage onDone={() => void check()} />;
  if (!authed) return <LoginPage onLogin={() => void check()} />;

  const items = navFor(role);
  const activeItem = items.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <DesktopSidebar email={email} items={items} onLogout={() => setAuthed(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur-lg lg:hidden">
          <Logo />
          <span className="text-sm font-medium text-fg-muted">{activeItem ? t('nav.' + activeItem.key) : ''}</span>
        </header>

        {/* Conteúdo */}
        <main className="w-full flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-8 lg:pb-8">
          <div key={pathname} className="animate-fade-in-up">
            <Routes>
              <Route path="/" element={<SetupPage />} />
              <Route path="/proxy" element={<ProxyPage />} />
              <Route path="/usage" element={<UsagePage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/router" element={<RouterPage />} />
              <Route path="/combos" element={<CombosPage />} />
              <Route path="/config" element={<ConfigPage />} />
              {role === 'admin' && <Route path="/users" element={<UsersPage />} />}
            </Routes>
          </div>
        </main>
      </div>

      {/* Bottom-nav mobile */}
      <MobileNav items={items} />
    </div>
  );
}

function DesktopSidebar({
  email,
  items,
  onLogout,
}: {
  email: string;
  items: NavItem[];
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const t = useT();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-border bg-surface/50 px-3 py-4 backdrop-blur-sm lg:flex">
      <div className="px-2 pb-6 pt-1">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((item) => {
          const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150',
                active
                  ? 'bg-surface-3 text-fg'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />
              )}
              <Icon size={17} className={active ? 'text-primary' : ''} />
              {t('nav.' + item.key)}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-border px-1 pt-3">
      <LangSwitch className="px-1" />
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-[rgb(90_50_200)] text-xs font-semibold text-white">
          {email.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{email}</span>
        <Tooltip content={t('nav.logout')} side="top">
          <button
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-err"
            onClick={async () => {
              await api.logout();
              onLogout();
            }}
            aria-label={t('nav.logout')}
          >
            <LogOut size={16} />
          </button>
        </Tooltip>
      </div>
      </div>
    </aside>
  );
}

function MobileNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-bg/90 px-2 py-1.5 backdrop-blur-lg lg:hidden">
      {items.map((item) => {
        const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-2xs transition-colors',
              active ? 'text-primary' : 'text-fg-subtle',
            )}
          >
            <Icon size={19} />
            <span className="max-w-full truncate">{t('nav.' + item.key).split(' ')[0]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
