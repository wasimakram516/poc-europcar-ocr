import type { Metadata } from 'next';
import { Comfortaa } from 'next/font/google';
import ThemeRegistry from '@/components/ThemeRegistry';
import './globals.css';

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Europcar OCR — Document Verification',
  description: 'AI-powered rental document verification for Europcar Oman',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={comfortaa.variable}>
      <body style={{ fontFamily: 'var(--font-comfortaa), sans-serif' }}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
