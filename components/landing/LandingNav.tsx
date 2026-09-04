'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { Lockup, Mark } from '../Brand';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#verification', label: 'Verification' },
  { href: '#management', label: 'For management' },
  { href: '#faq', label: 'FAQ' }
];

export default function LandingNav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('glam_theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
    setDark(next);
  };

  return (
    <>
      <header className="sticky top-0 z-50 px-3 sm:px-5 pt-3">
        <nav
          aria-label="Main"
          className="mx-auto max-w-[1240px] flex items-center gap-3 px-4 sm:px-5 border transition-all duration-300"
          style={{
            borderColor: stuck ? 'var(--border)' : 'transparent',
            background: stuck ? 'color-mix(in srgb, var(--bg) 88%, transparent)' : 'transparent',
            backdropFilter: stuck ? 'blur(10px)' : 'none',
            paddingTop: stuck ? 8 : 14,
            paddingBottom: stuck ? 8 : 14
          }}
        >
          {/* TEACH CLOCK is a long name, so the full lockup needs room the phone
              header does not have — below sm it would be squeezed by the flex row
              until the diamond went illegible. The brand kit's own rule applies:
              under the lockup minimum, the mark stands alone. */}
          <Link href="/" aria-label="Teach Clock home" className="flex-none">
            <span className="hidden sm:inline-flex"><Lockup size={56} priority /></span>
            <span className="sm:hidden"><Mark size={40} priority /></span>
          </Link>

          <div className="hidden md:flex items-center gap-7 ml-8 text-sm font-medium">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
                {l.label}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link href="/auth" className="hidden sm:inline-flex btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/auth?tab=register" className="btn btn-primary btn-sm">Get started</Link>
            <button className="md:hidden btn btn-ghost btn-sm" onClick={() => setOpen(true)}
              aria-label="Open menu" aria-expanded={open}>
              <Menu size={17} />
            </button>
          </div>
        </nav>
      </header>

      {open ? (
        <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0" style={{ background: 'var(--ink)' }} />
          <div className="relative h-full flex flex-col p-6" style={{ color: 'var(--cream)' }}>
            <div className="flex items-center justify-between">
              <Lockup size={56} ground="dark" />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu"
                style={{ color: 'var(--cream)', borderColor: 'var(--rule-dark)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="mt-12 flex flex-col gap-6">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                  className="font-display text-3xl font-extrabold">{l.label}</a>
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-3">
              <Link href="/auth?tab=register" className="btn btn-gold btn-block">Get started</Link>
              <Link href="/auth" className="btn btn-ghost btn-block"
                style={{ color: 'var(--cream)', borderColor: 'var(--rule-dark)' }}>Sign in</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
