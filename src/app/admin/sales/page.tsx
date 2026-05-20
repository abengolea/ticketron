import { redirect } from 'next/navigation';

/** Ventas global consolidada en Admin → Evento → pestaña Entradas */
export default function AdminSalesRedirectPage() {
  redirect('/admin/events');
}
