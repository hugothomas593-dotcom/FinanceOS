import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Avenor — Financial workspace', description: 'A clear view of cash, operating performance and company decisions for growing teams.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
