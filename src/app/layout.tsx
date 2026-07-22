import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { Header } from '@/components/header';
import { AppMain } from '@/components/app-main';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Inter, Belleza } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const belleza = Belleza({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-belleza',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ticketron',
  description:
    'Vendé entradas digitales, cobrá con Mercado Pago y validá en puerta. Para productores de eventos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${belleza.variable} dark`}>
      <body className="font-body antialiased min-h-screen flex flex-col">
        <FirebaseClientProvider>
          <Header />
          <AppMain>{children}</AppMain>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
