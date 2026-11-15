import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: {
    default: 'Avenor — Financial decision intelligence for founders',
    template: '%s — Avenor',
  },
  description: 'Understand your runway, model the decisions ahead and build with a clearer view of your company finances.',
  applicationName: 'Avenor',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
