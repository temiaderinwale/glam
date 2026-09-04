import AppShell from '@/components/AppShell';
import { DataProvider } from '@/lib/data';

/* Every authenticated route inherits the shell and the data layer from here. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
