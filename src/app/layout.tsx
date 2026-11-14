import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Avenor — Financial Decision Intelligence', description: 'Financial decision intelligence for European startups' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
