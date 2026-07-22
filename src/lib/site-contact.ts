/** Datos societarios del prestador (Notificas SRL). */
export const COMPANY = {
  legalName: 'NOTIFICAS SRL',
  cuit: '33-71729868-9',
  addressLine: 'Colón 12, Primer Piso',
  city: 'San Nicolás de los Arroyos',
  province: 'Provincia de Buenos Aires',
  country: 'Argentina',
  email: 'contacto@notificas.com',
  phone: '+54 9 336 464-5357',
  phoneHref: 'tel:+5493364645357',
} as const;

export const CONTACT_EMAIL = COMPANY.email;
export const CONTACT_MAILTO = `mailto:${COMPANY.email}` as const;

export const PRODUCT_NAME = 'Ticketron';
