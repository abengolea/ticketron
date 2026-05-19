import { z } from 'zod';

export const buyerCheckoutSchema = z
  .object({
    buyerName: z.string().min(2, 'Nombre requerido (mín. 2 caracteres)'),
    buyerLastName: z.string().min(2, 'Apellido requerido (mín. 2 caracteres)'),
    buyerPhone: z.string().min(8, 'Teléfono inválido').optional().or(z.literal('')),
    buyerEmail: z.string().trim().email('Email inválido'),
    buyerEmailConfirm: z.string().trim().email('Confirmá tu email'),
  })
  .refine(
    (data) =>
      data.buyerEmail.toLowerCase() === data.buyerEmailConfirm.toLowerCase(),
    { message: 'Los emails no coinciden', path: ['buyerEmailConfirm'] }
  );

export const createEventSchema = z.object({
  name: z.string().min(3, 'Nombre del evento requerido'),
  date: z.string().datetime({ message: 'Fecha inválida' }),
  location: z.string().optional(),
  capacity: z.coerce.number().int().positive('Capacidad debe ser mayor a 0'),
  price: z.coerce.number().positive('Precio debe ser mayor a 0'),
  active: z.boolean().default(true),
});

export const updateEventSchema = createEventSchema.partial().extend({
  id: z.string().min(1),
});

export const createSellerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  displayName: z.string().min(2, 'Nombre requerido'),
});

export const createSellerAccessSchema = z.object({
  sellerId: z.string().min(1),
  eventId: z.string().min(1),
  quota: z.coerce.number().int().nonnegative(),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
});

export const updateUserSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(['admin', 'seller', 'gate']).optional(),
  active: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
});

export const createPaymentLinkSchema = z.object({
  eventId: z.string().min(1),
  ticketQuantity: z.coerce.number().int().min(1).max(20),
});

export const createComplimentaryLinkSchema = z.object({
  eventId: z.string().min(1),
  ticketQuantity: z.coerce.number().int().min(1).max(20),
  beneficiaryEmail: z.string().trim().email('Email inválido'),
  beneficiaryName: z.string().min(2, 'Nombre requerido (mín. 2 caracteres)').optional().or(z.literal('')),
  message: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
});

export const createCashSaleSchema = z.object({
  eventId: z.string().min(1),
  ticketQuantity: z.coerce.number().int().min(1).max(20),
  buyerName: z.string().min(2, 'Nombre requerido (mín. 2 caracteres)').optional().or(z.literal('')),
  buyerLastName: z.string().min(2, 'Apellido requerido (mín. 2 caracteres)').optional().or(z.literal('')),
  buyerPhone: z.string().min(8, 'Teléfono inválido').optional().or(z.literal('')),
  buyerEmail: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  sendEmail: z.boolean().optional(),
});

export const gateValidateSchema = z.object({
  eventId: z.string().min(1),
  qrPayload: z.string().min(10),
});

export const cancelPaymentLinkSchema = z.object({
  paymentLinkId: z.string().min(1),
});

export const cancelTicketSchema = z.object({
  ticketId: z.string().min(1),
});

export type BuyerCheckoutInput = z.infer<typeof buyerCheckoutSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateSellerInput = z.infer<typeof createSellerSchema>;
export type CreateSellerAccessInput = z.infer<typeof createSellerAccessSchema>;
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;
export type CreateComplimentaryLinkInput = z.infer<typeof createComplimentaryLinkSchema>;
export type CreateCashSaleInput = z.infer<typeof createCashSaleSchema>;
