import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: {
    default: 'Avenor — Your AI finance partner for founders',
    template: '%s — Avenor',
  },
  description: 'Ask your AI finance Copilot what you can afford, understand your cash position and model the decisions ahead using your company data.',
  applicationName: 'Avenor',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
