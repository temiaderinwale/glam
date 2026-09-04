import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import { GlamProvider } from '@/lib/store';
import './globals.css';

/* Archivo 900 is not optional: the wordmark's accent geometry is cut to
   Archivo's M and will not land in a fallback face. */
const archivo = Archivo({
  subsets: ['latin'], weight: ['400', '600', '700', '800', '900'],
  variable: '--font-archivo', display: 'swap'
});
const inter = Inter({
  subsets: ['latin'], weight: ['400', '500', '600', '700'],
  variable: '--font-inter', display: 'swap'
});
const mono = JetBrains_Mono({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-mono', display: 'swap'
});

export const metadata: Metadata = {
  title: { default: 'Teach Clock - Verified teaching, confirmed by the school', template: '%s - Teach Clock' },
  description:
    'Teach Clock is the teaching accountability platform from Glampter Consults. Teachers log sessions, ' +
    'schools confirm them, and management sees every approved hour. Teach. Verify. Clock. Report.',
  applicationName: 'Teach Clock',
  openGraph: {
    title: 'Teach Clock - Verified teaching, confirmed by the school',
    description: 'Teach. Verify. Clock. Report. A Glampter Consults platform.',
    siteName: 'Teach Clock', type: 'website'
  }
};

export const viewport: Viewport = { themeColor: '#17140F', width: 'device-width', initialScale: 1 };

/* Applied before paint so the theme never flashes. Light is the default. */
const themeInit =
  `try{if(localStorage.getItem('glam_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className={`${archivo.variable} ${inter.variable} ${mono.variable}`}>
        <GlamProvider>{children}</GlamProvider>
      </body>
    </html>
  );
}
