import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = { title: 'Treat or Code', description: 'A spooky programming challenge.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
