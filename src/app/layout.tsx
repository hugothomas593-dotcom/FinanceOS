import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'FinanceOS — Financial Intelligence', description: 'Decision intelligence for Seed-stage startups' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
