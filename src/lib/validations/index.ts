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
  role: z.enum(['producer', 'dirigente', 'seller', 'gate']).optional(),
  active: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
});

export const createProducerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  displayName: z.string().min(2, 'Nombre requerido'),
  maxEvents: z.coerce.number().int().nonnegative(),
  quotaType: z.enum(['monthly', 'lifetime', 'unlimited']),
  pricePerEvent: z.coerce.number().nonnegative(),
  pricePerTicket: z.coerce.number().nonnegative().default(0),
  planNotes: z.string().max(500).optional().or(z.literal('')),
  mercadoPagoAccessToken: z.string().min(10).optional().or(z.literal('')),
});

export const registerProducerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  displayName: z.string().min(2, 'Nombre requerido').max(80),
  organizationName: z.string().min(2, 'Nombre de productora requerido').max(100),
  phone: z.string().min(8, 'Teléfono inválido').max(30),
  registrationNotes: z.string().max(500).optional().or(z.literal('')),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Debés aceptar las Bases y Condiciones' }),
  }),
});

export const approveProducerSchema = z.object({
  uid: z.string().min(1),
  maxEvents: z.coerce.number().int().nonnegative(),
  quotaType: z.enum(['monthly', 'lifetime', 'unlimited']),
  pricePerEvent: z.coerce.number().nonnegative(),
  pricePerTicket: z.coerce.number().nonnegative(),
  planNotes: z.string().max(500).optional().or(z.literal('')),
});

export const rejectProducerSchema = z.object({
  uid: z.string().min(1),
});

export const updatePlatformBillingSchema = z.object({
  pricePerEvent: z.coerce.number().nonnegative(),
  pricePerTicket: z.coerce.number().nonnegative(),
});

export const updateProducerSchema = z.object({
  uid: z.string().min(1),
  active: z.boolean().optional(),
  displayName: z.string().min(2).optional(),
  maxEvents: z.coerce.number().int().nonnegative().optional(),
  quotaType: z.enum(['monthly', 'lifetime', 'unlimited']).optional(),
  pricePerEvent: z.coerce.number().nonnegative().optional(),
  pricePerTicket: z.coerce.number().nonnegative().optional(),
  planActive: z.boolean().optional(),
  planNotes: z.string().max(500).optional().or(z.literal('')),
  mercadoPagoAccessToken: z.string().min(10).optional().or(z.literal('')),
});

export const updateProducerSettingsSchema = z.object({
  mercadoPagoAccessToken: z.string().min(10, 'Token de acceso inválido'),
});

export const updateProducerBillingProfileSchema = z.object({
  ivaCondicion: z.enum(['responsable_inscripto', 'monotributo', 'consumidor_final']),
  cuit: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || v.replace(/\D/g, '').length === 11,
      'CUIT inválido (11 dígitos)'
    ),
  razonSocial: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  domicilio: z.string().trim().max(200).optional().or(z.literal('')),
});

export const createDirigenteSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  displayName: z.string().min(2, 'Nombre requerido'),
  clubName: z.string().trim().min(2, 'Nombre del club requerido').max(80),
});

export const updateDirigenteSchema = z.object({
  uid: z.string().min(1),
  active: z.boolean().optional(),
  displayName: z.string().min(2).optional(),
  clubName: z.string().trim().min(2).max(80).optional(),
});

export const createPaymentLinkSchema = z.object({
  eventId: z.string().min(1),
  ticketQuantity: z.coerce.number().int().min(1).max(20),
  recipientLabel: z
    .string()
    .trim()
    .max(80, 'Máximo 80 caracteres')
    .optional()
    .or(z.literal('')),
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

export const createBarProductSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(2, 'Nombre del producto requerido').max(60, 'Máximo 60 caracteres'),
  price: z.coerce.number().positive('Precio debe ser mayor a 0'),
  stock: z.coerce.number().int().nonnegative().nullable().optional(),
});

export const updateBarProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().trim().min(2, 'Nombre del producto requerido').max(60).optional(),
  price: z.coerce.number().positive('Precio debe ser mayor a 0').optional(),
  active: z.boolean().optional(),
  stock: z.coerce.number().int().nonnegative().nullable().optional(),
});

export const createBarOrderSchema = z.object({
  eventId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .min(1),
  buyerName: z.string().trim().min(2, 'Nombre requerido').max(60, 'Máximo 60 caracteres'),
});

export const setBarProductActiveSchema = z.object({
  productId: z.string().min(1),
  active: z.boolean(),
});

export const redeemBarOrderSchema = z.object({
  orderId: z.string().min(1),
});

export const reorderBarProductsSchema = z.object({
  eventId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1),
});

export const barValidateSchema = z.object({
  eventId: z.string().min(1),
  qrPayload: z.string().min(10),
});

export const cancelPaymentLinkSchema = z.object({
  paymentLinkId: z.string().min(1),
});

export const archivePaymentLinkSchema = z.object({
  paymentLinkId: z.string().min(1),
});

export const cancelTicketSchema = z.object({
  ticketId: z.string().min(1),
});

export const archiveTicketSchema = z.object({
  ticketId: z.string().min(1),
});

export const requestBuyerAccessSchema = z.object({
  email: z.string().trim().email('Email inválido'),
});

export const completeBuyerActivationSchema = z.object({
  code: z.string().min(6, 'Código inválido').max(12),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  displayName: z.string().min(2, 'Nombre requerido').optional(),
});

export const buyerSignInSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const setMyClubNameSchema = z.object({
  clubName: z.string().trim().min(2, 'Nombre del club requerido').max(80),
});

export const createAccessDaySchema = z.object({
  clubName: z.string().trim().min(2, 'Nombre del club requerido').max(80).optional(),
  date: z.string().datetime({ message: 'Fecha inválida' }),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  toleranceMinutes: z.coerce.number().int().min(0).max(180).default(30),
});

export const updateAccessDaySchema = createAccessDaySchema.partial().extend({
  accessDayId: z.string().min(1),
  active: z.boolean().optional(),
});

export const createAccessEventSchema = z.object({
  accessDayId: z.string().min(1),
  name: z.string().trim().min(2, 'Nombre requerido').max(80),
  discipline: z.string().trim().max(40).optional().or(z.literal('')),
  visitingClubName: z.string().trim().min(2, 'Club visitante requerido').max(80),
  scheduledStart: z.string().datetime({ message: 'Inicio inválido' }),
  scheduledEnd: z.string().datetime({ message: 'Fin inválido' }),
  entryWindowStart: z.string().datetime({ message: 'Ventana de ingreso inválida' }),
  entryWindowEnd: z.string().datetime({ message: 'Ventana de ingreso inválida' }),
  maxVisitors: z.coerce.number().int().positive().nullable().optional(),
});

export const updateAccessEventSchema = createAccessEventSchema
  .partial()
  .extend({
    accessEventId: z.string().min(1),
    active: z.boolean().optional(),
  })
  .omit({ accessDayId: true });

export const createVisitorInviteLinkSchema = z.object({
  accessDayId: z.string().min(1),
  accessEventId: z.string().min(1).optional(),
  visitingClubLabel: z.string().trim().max(80).optional().or(z.literal('')),
  maxRegistrations: z.coerce.number().int().positive().nullable().optional(),
  maxPartySize: z.coerce.number().int().min(1).max(50).optional(),
  expiresAt: z.string().datetime({ message: 'Vencimiento inválido' }).optional(),
});

export const registerAccessPassSchema = z.object({
  token: z.string().min(10),
  accessEventId: z.string().min(1),
  firstName: z.string().trim().min(2, 'Nombre requerido'),
  lastName: z.string().trim().min(2, 'Apellido requerido'),
  dni: z.string().trim().min(6, 'DNI inválido').max(15),
  email: z.string().trim().email('Email inválido'),
  visitingClub: z.string().trim().min(2, 'Club visitante requerido'),
  partySize: z.coerce.number().int().min(1).max(50),
  companionDnis: z.array(z.string().trim().min(6).max(15)).max(49).optional(),
  mode: z.enum(['group', 'individual']).default('group'),
});

export const accessGateValidateSchema = z.object({
  accessDayId: z.string().min(1),
  accessEventId: z.string().min(1),
  scanType: z.enum(['entry', 'exit']),
  qrPayload: z.string().min(10),
});

export const cancelAccessPassSchema = z.object({
  passId: z.string().min(1),
});

export type BuyerCheckoutInput = z.infer<typeof buyerCheckoutSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateSellerInput = z.infer<typeof createSellerSchema>;
export type CreateSellerAccessInput = z.infer<typeof createSellerAccessSchema>;
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;
export type CreateComplimentaryLinkInput = z.infer<typeof createComplimentaryLinkSchema>;
export type CreateCashSaleInput = z.infer<typeof createCashSaleSchema>;
