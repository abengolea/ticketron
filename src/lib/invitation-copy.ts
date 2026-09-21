export function defaultInvitationCopy(eventName: string): {
  subject: string;
  headline: string;
  message: string;
} {
  return {
    subject: `Estás invitado a ${eventName}`,
    headline: 'Estás invitado',
    message:
      `Queremos que nos acompañes en ${eventName}.\n\n` +
      'Para guardar tu lugar, decinos cuántas entradas vas a necesitar. Así bloqueamos cupo y no se agotan sin vos.',
  };
}
