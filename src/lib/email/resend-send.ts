export interface ResendInlineAttachment {
  filename: string;
  content: string;
  content_id: string;
  content_type?: string;
}

export async function sendEmailViaResend(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: ResendInlineAttachment[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY o EMAIL_FROM no configurados');
  }

  const body: Record<string, unknown> = {
    from,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };

  if (params.attachments?.length) {
    body.attachments = params.attachments;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}
