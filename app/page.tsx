import type { Metadata } from 'next';
import Landing from '@/components/landing/Landing';

export const metadata: Metadata = {
  /* title.template in the root layout does not reach this segment — spell it out. */
  title: 'Teach Clock — Verified teaching, confirmed by the school',
  description:
    'Teach Clock connects Glampter Consults, its teachers and the schools they serve. Teachers log ' +
    'sessions, schools verify them, management reports on every approved hour.'
};

export default function HomePage() {
  return <Landing />;
}
