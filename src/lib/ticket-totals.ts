import type { SerializedTicketWithPayment } from '@/lib/models';

export function isActiveTicket(ticket: SerializedTicketWithPayment) {
  return !ticket.archived && ticket.status !== 'CANCELLED';
}

export function countsTowardRevenue(ticket: SerializedTicketWithPayment) {
  return isActiveTicket(ticket) && ticket.paymentMethod !== 'complimentary';
}

export function computeTicketTotals(tickets: SerializedTicketWithPayment[]) {
  const active = tickets.filter(isActiveTicket);
  const revenueTickets = active.filter(countsTowardRevenue);
  const totalRevenue = revenueTickets.reduce((sum, t) => sum + t.paymentAmount, 0);

  return {
    totalRevenue,
    activeTickets: active.length,
    archivedTickets: tickets.filter((t) => t.archived).length,
  };
}
