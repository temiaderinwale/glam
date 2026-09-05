/* Teach Clock — formatting. Naira, dates, durations, and turning Firebase codes into
   sentences a school administrator can act on. */

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 0
});

export const money = (n: number) => naira.format(Math.round(n));

/** Compact naira for chart captions and tight cards: ₦1.2m, ₦640k. */
export function moneyShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
}

/** Hours to one decimal, trailing .0 dropped: 3, 4.5, 12.5 */
export function hours(minutes: number) {
  const h = minutes / 60;
  return (Math.round(h * 10) / 10).toString();
}

export const hoursLabel = (minutes: number) => `${hours(minutes)} hrs`;

export function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** 1st, 2nd, 3rd, 4th … 21st. The teens are the exception that catches people. */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/** 5th September — the date written the way it is spoken. */
export function dateFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return ordinal(d.getDate()) + ' ' + MONTHS_FULL[d.getMonth()];
}

/** 24 Aug 2026 */
export function dateLong(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 24 Aug */
export function dateShort(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
};

/** "2 days ago" — used for pending-approval age, which is a management figure. */
export function ago(iso: string, now = new Date()) {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const pct = (n: number) => `${Math.round(n)}%`;

export const timeRange = (start: string, end: string) => `${start} – ${end}`;

/** Password strength, 0–4, rendered with the brand bar motif. */
export function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

/** Firebase auth codes → what happened and what to do about it. */
export function authError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-credential': "That email and password don't match an account. Check both, or reset your password.",
    'auth/wrong-password': "That password is incorrect. Try again or reset it.",
    'auth/user-not-found': "No account uses that email address. Register to create one.",
    'auth/email-already-in-use': "An account already uses that email. Sign in instead.",
    'auth/weak-password': "Choose a password of at least 8 characters.",
    'auth/invalid-email': "That email address isn't formatted correctly.",
    'auth/too-many-requests': "Too many attempts. Wait a few minutes, then try again.",
    'auth/popup-closed-by-user': "The Google window closed before sign-in finished. Try again.",
    'auth/popup-blocked': "Your browser blocked the Google window. Allow pop-ups for this site, then try again.",
    'auth/network-request-failed': "The network dropped. Check your connection and try again.",
    'auth/unauthorized-domain': "This domain isn't authorised in the Firebase console yet.",
    'auth/operation-not-allowed': "That sign-in method isn't enabled in the Firebase console yet."
  };
  return map[code] || "Something went wrong signing you in. Try again in a moment.";
}

/** 25 Aug 2026, 14:32 — for audit rows and review timestamps. */
export function stamp(isoDateTime?: string) {
  if (!isoDateTime) return '—';
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return isoDateTime;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dateLong(isoDateTime.slice(0, 10))}, ${hh}:${mm}`;
}

export function fileSize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/* The greeting is read off the organisation's clock, not the visitor's and not
   the server's. Two reasons, and the second is the one that bites:

     • the firm works out of Ogun State, so "morning" means morning there;
     • NEXT_PUBLIC builds render on a host that is very often in another
       timezone, and a greeting computed from the machine's local hour would
       differ between the server pass and hydration — the same class of
       mismatch that broke this app once already. Pinning the zone makes both
       sides agree by construction. */

/** The hour, 0–23, on the organisation's clock. */
export function orgHour(timezone = 'Africa/Lagos', now = new Date()): number {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', hour12: false
    }).format(now));
    return Number.isFinite(h) ? h % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}

/** Morning until noon, afternoon until 17:00, evening after that. */
export function greeting(hour = orgHour()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Today in the organisation's timezone, as YYYY-MM-DD. */
export function todayISO(timezone = 'Africa/Lagos') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const nowISO = () => new Date().toISOString();

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
