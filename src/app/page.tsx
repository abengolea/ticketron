import { redirect } from 'next/navigation';

/** Inicio: ir al login; usuarios autenticados usan el menú (Ventas / Impresión) */
export default function HomePage() {
  redirect('/login');
}
