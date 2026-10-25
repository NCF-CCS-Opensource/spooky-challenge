import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = { title: 'Treat or Code', description: 'A spooky programming challenge.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
