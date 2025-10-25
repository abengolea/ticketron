export interface EventParameters {
  event_name: string;
  event_id: string;
  date_time: string;
  venue: string;
  quantity: number;
  tickets_per_page: number;
  page_size: 'A4' | 'Letter';
}

export interface TicketData {
  ticketNumber: number;
  ticketId: string;
  qrPayload: string;
  shortCode: string;
}

export interface GenerationResult {
  tickets: TicketData[];
  secretKey: string;
  eventParams: EventParameters;
}
