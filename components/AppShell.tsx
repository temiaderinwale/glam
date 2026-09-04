'use client';
/* Teach Clock — the authenticated shell.

   NAV below is the one source of truth: the desktop sidebar, the mobile tab bar
   and the role gate all read it. Adding a module in Phase 2 means flipping its
   `status` to 'live' and writing the page — nothing else moves. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity, BarChart3, Bell, BookOpen, Building2, CalendarDays, ClipboardCheck,
  FileText, GraduationCap, LayoutDashboard, ListChecks, LogOut, Moon, PlusCircle,
  Search, Settings, ShieldCheck, ShieldPlus, Sun, Users, Menu, X, type LucideIcon
} from 'lucide-react';
import { BrandWord, Lockup, Mark } from './Brand';
import Preloader from './Preloader';
import { useData } from '@/lib/data';
import { useGlam } from '@/lib/store';
import { ago } from '@/lib/format';
import type { NavStatus, Role } from '@/lib/types';

export type NavItem = {
  key: string; href: string; title: string; icon: LucideIcon;
  group: string; roles: Role[]; status: NavStatus; mobile?: boolean;
  /** Hidden from standard admins — only an active super admin sees it. */
  superAdmin?: boolean;
};

const ALL: Role[] = ['teacher', 'school', 'admin'];

export const NAV: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', title: 'Dashboard', icon: LayoutDashboard, group: 'Overview', roles: ALL, status: 'live', mobile: true },

  { key: 'log', href: '/sessions/new', title: 'Log session', icon: PlusCircle, group: 'Teaching', roles: ['teacher'], status: 'live', mobile: true },
  { key: 'history', href: '/sessions', title: 'Teaching history', icon: ListChecks, group: 'Teaching', roles: ALL, status: 'live', mobile: true },
  { key: 'approvals', href: '/approvals', title: 'Approval queue', icon: ClipboardCheck, group: 'Teaching', roles: ['school', 'admin'], status: 'live', mobile: true },
  { key: 'myschools', href: '/my-schools', title: 'My schools', icon: Building2, group: 'Teaching', roles: ['teacher'], status: 'live' },
  { key: 'schedule', href: '/schedule', title: 'Schedule', icon: CalendarDays, group: 'Teaching', roles: ALL, status: 'live' },

  { key: 'schools', href: '/schools', title: 'Schools', icon: Building2, group: 'Network', roles: ['admin'], status: 'live' },
  { key: 'teachers', href: '/teachers', title: 'Teachers', icon: GraduationCap, group: 'Network', roles: ['school', 'admin'], status: 'live' },
  { key: 'assignments', href: '/assignments', title: 'Assignments', icon: Users, group: 'Network', roles: ['admin'], status: 'live' },

  { key: 'financials', href: '/financials', title: 'Service & financial report', icon: BarChart3, group: 'Reporting', roles: ['school', 'admin'], status: 'live', mobile: true },
  { key: 'reports', href: '/reports', title: 'Reports', icon: FileText, group: 'Reporting', roles: ALL, status: 'live', mobile: true },
  { key: 'analytics', href: '/analytics', title: 'Analytics', icon: Activity, group: 'Reporting', roles: ['admin'], status: 'live' },

  { key: 'subjects', href: '/subjects', title: 'Subjects & classes', icon: BookOpen, group: 'Administration', roles: ['admin'], status: 'live' },
  { key: 'documents', href: '/documents', title: 'Documents', icon: FileText, group: 'Administration', roles: ALL, status: 'live' },
  { key: 'audit', href: '/audit', title: 'Audit log', icon: ShieldCheck, group: 'Administration', roles: ['admin'], status: 'live' },
  { key: 'settings', href: '/settings', title: 'Settings', icon: Settings, group: 'Administration', roles: ALL, status: 'live' },
  { key: 'adminmgr', href: '/admin-manager', title: 'Admin Manager', icon: ShieldPlus, group: 'Administration', roles: ['admin'], status: 'live', superAdmin: true }
];

export const navFor = (role: Role, superAdmin = false) =>
  NAV.filter((n) => n.roles.includes(role) && (!n.superAdmin || superAdmin));

const GROUPS = ['Overview', 'Teaching', 'Network', 'Reporting', 'Administration'];

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')); }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('glam_theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
    setDark(next);
  };
  return { dark, toggle };
}

function RoleSwitch() {
  const { role, setPreviewRole, profile } = useGlam();
  /* Preview control only — a signed-in account's role comes from its profile and
     cannot be switched here. Remove this block to ship. */
  if (profile) return null;
  return (
    <label className="preview-chip no-print">
      <span className="hidden sm:inline">Preview as</span>
      <select
        className="bg-transparent font-semibold text-[var(--text)] outline-none cursor-pointer"
        value={role}
        aria-label="Preview dashboard as role"
        onChange={(e) => setPreviewRole(e.target.value as Role)}
      >
        <option value="teacher">Teacher</option>
        <option value="school">School</option>
        <option value="admin">Administrator</option>
      </select>
    </label>
  );
}

function NotificationBell() {
  const { myNotifications, unread, markNotificationsRead } = useData();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="btn btn-ghost btn-sm relative" aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open) void markNotificationsRead(); }}
      >
        <Bell size={16} />
        {unread ? (
          <span
            className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 text-[10px] font-bold
                       flex items-center justify-center"
            style={{ background: 'var(--gold)', color: 'var(--ink)' }}
          >{unread}</span>
        ) : null}
      </button>

      {open ? (
        <>
          <button className="fixed inset-0 z-[60]" aria-label="Close notifications"
            onClick={() => setOpen(false)} style={{ cursor: 'default' }} />
          <div className="notif frame">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="eyebrow">Notifications</span>
            </div>
            {myNotifications.length ? myNotifications.slice(0, 12).map((n) => (
              <Link key={n.id} href={n.href ?? '/dashboard'} onClick={() => setOpen(false)}
                className={`notif-item${n.read ? '' : ' is-unread'}`}>
                <span className="block font-semibold text-sm">{n.title}</span>
                <span className="block text-xs text-[var(--text-2)] mt-1">{n.body}</span>
                <span className="block text-[11px] text-[var(--text-3)] mono mt-1.5">
                  {ago(n.createdAt)}
                </span>
              </Link>
            )) : (
              <p className="px-4 py-6 text-sm text-[var(--text-2)] text-center">Nothing new right now.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { stage, role, profile, logout } = useGlam();
  const { isSuperAdmin } = useData();
  const { dark, toggle } = useDark();
  const [sheet, setSheet] = useState(false);

  useEffect(() => { setSheet(false); }, [pathname]);

  if (stage === 'loading') return <Preloader />;

  const items = navFor(role, isSuperAdmin);
  const mobileItems = items.filter((n) => n.mobile).slice(0, 4);
  const current = items.find((n) => n.href === pathname);
  const name = profile?.displayName || 'Preview session';

  const renderNav = (onNavigate?: () => void) => (
    <>
      {GROUPS.map((g) => {
        const group = items.filter((n) => n.group === g);
        if (!group.length) return null;
        return (
          <div key={g}>
            <div className="nav-group">{g}</div>
            {group.map((n) => (
              <Link
                key={n.key} href={n.href} onClick={onNavigate}
                className={`nav-item${pathname === n.href ? ' is-active' : ''}${n.status === 'soon' ? ' is-soon' : ''}`}
                aria-current={pathname === n.href ? 'page' : undefined}
              >
                <n.icon size={16} strokeWidth={2} aria-hidden="true" />
                <span className="truncate">{n.title}</span>
                {n.status === 'soon' ? <span className="nav-soon">Soon</span> : null}
              </Link>
            ))}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="sidebar-head">
          <Link href="/" aria-label="Teach Clock home">
            <Lockup size={70} ground="dark" priority />
          </Link>
          <p className="eyebrow mt-3" style={{ color: '#CFC3AC' }}>A Glampter platform</p>
        </div>
        <nav className="sidebar-nav" aria-label="Main">{renderNav()}</nav>
        <div className="sidebar-foot">
          <button className="nav-item w-full" onClick={() => void logout()}>
            <LogOut size={16} strokeWidth={2} aria-hidden="true" />
            <span>{profile ? 'Sign out' : 'Sign in'}</span>
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar no-print">
          <button
            className="lg:hidden btn btn-ghost btn-sm" onClick={() => setSheet(true)}
            aria-label="Open navigation" aria-expanded={sheet}
          >
            <Menu size={17} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold text-[17px] truncate">
              {current?.title ?? <BrandWord />}
            </div>
          </div>

          <label className="hidden xl:flex items-center gap-2 px-3 h-9 border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <Search size={15} className="text-[var(--text-3)]" aria-hidden="true" />
            <span className="sr-only">Search sessions, teachers, schools</span>
            <input
              className="bg-transparent outline-none text-sm w-52"
              placeholder="Search TS-000928, teacher, school"
            />
          </label>

          <RoleSwitch />

          <NotificationBell />

          <button className="btn btn-ghost btn-sm" onClick={toggle}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'var(--border)' }}>
            <span
              className="w-8 h-8 flex items-center justify-center font-display font-extrabold text-[13px]"
              style={{ background: 'var(--ink)', color: 'var(--cream)' }}
              aria-hidden="true"
            >{name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
            <span className="text-sm leading-tight">
              <span className="block font-semibold truncate max-w-[150px]">{name}</span>
              <span className="block text-[var(--text-3)] text-xs capitalize">{role}</span>
            </span>
          </div>
        </header>

        <main className="page">{children}</main>
      </div>

      {/* Mobile: five destinations plus a sheet for the rest */}
      <nav className="mob-nav no-print" aria-label="Primary">
        {mobileItems.map((n) => (
          <Link key={n.key} href={n.href}
            className={`mob-item${pathname === n.href ? ' is-active' : ''}`}
            aria-current={pathname === n.href ? 'page' : undefined}>
            <n.icon size={19} strokeWidth={2} aria-hidden="true" />
            <span>{n.title.split(' ')[0]}</span>
          </Link>
        ))}
        <button className="mob-item" onClick={() => setSheet(true)} aria-label="More">
          <Menu size={19} strokeWidth={2} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {role === 'teacher' ? (
        <Link href="/sessions/new" className="fab no-print">
          <PlusCircle size={18} strokeWidth={2.4} aria-hidden="true" />
          Log session
        </Link>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/60" aria-label="Close navigation"
            onClick={() => setSheet(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] flex flex-col"
            style={{ background: 'var(--ink)' }}>
            <div className="sidebar-head flex items-center justify-between">
              <Mark size={34} ground="dark" />
              <button className="btn btn-ghost btn-sm" onClick={() => setSheet(false)} aria-label="Close">
                <X size={17} />
              </button>
            </div>
            <nav className="sidebar-nav" aria-label="All modules">{renderNav(() => setSheet(false))}</nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
