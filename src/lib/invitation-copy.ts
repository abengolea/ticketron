export const MAX_INVITE_TICKETS_PER_GUEST = 6;

export const INVITE_LINK_PLACEHOLDER = '{{link}}';

export function defaultInvitationCopy(eventName: string): {
  subject: string;
  headline: string;
  message: string;
} {
  return {
    subject: `Estás invitado a ${eventName}`,
    headline: 'Hola!',
    message: `Si recibís este mail es porque ya fuiste parte de alguna de nuestras fiestas de Música & Amigos, y queremos invitarte a nuestro próximo encuentro:

M&A FEST #8 🎶🥂

📅 11 de octubre – 22:30 hs
📍 Savio 246 – San Nicolás
🎟️ Valor actual: $37.000

Para esta edición armamos un sistema simple de reserva.

Ingresando al siguiente botón podés indicar cuántas entradas necesitás:

${INVITE_LINK_PLACEHOLDER}

La reserva te permite mantener el valor de $37.000 por entrada hasta el domingo 27 de septiembre.
Hasta ese día vas a poder completar el pago al precio actual. Si al vencer el plazo la reserva no fue abonada, se cancelará automáticamente y esas entradas volverán a quedar disponibles para la venta al nuevo valor vigente.

Por eso, si tenés pensado venir, te recomendamos hacer la reserva ahora y definir la cantidad de entradas que vas a necesitar.

Como siempre, M&A es una fiesta privada y queremos seguir cuidando el espíritu que tuvo desde la primera edición: encontrarnos, bailar, divertirnos y compartir la noche con la gente que forma parte de esta comunidad.

Nos encanta volver a encontrarnos con quienes ya fueron parte de M&A.

Nos vemos en ${eventName}.

Música & Amigos`,
  };
}
