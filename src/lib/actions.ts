
"use server";

import { createHmac, randomBytes, randomUUID } from "crypto";
import { checkParametersWithAI } from "@/ai/flows/check-parameters-with-ai";
import type { EventParameters, TicketData, GenerationResult } from "./types";
import { base32Encode } from "./utils";

function createSignature(payload: string, secretKey: string): string {
  const hmac = createHmac("sha256", Buffer.from(secretKey, "base64"));
  hmac.update(payload);
  return hmac.digest().slice(0, 12).toString("base64url");
}

export async function generateTicketsAction(
  params: EventParameters & { starting_ticket_number?: number }
): Promise<{ success: true; data: GenerationResult } | { success: false; error: string }> {
  try {
    const aiCheckResult = await checkParametersWithAI(params);

    if (!aiCheckResult.valid) {
      return { success: false, error: aiCheckResult.feedback };
    }

    const secretKey = randomBytes(32).toString("base64");
    const tickets: TicketData[] = [];
    
    const startingTicketNumber = params.starting_ticket_number || 1;

    for (let i = 0; i < params.quantity; i++) {
      const ticketNumber = startingTicketNumber + i;
      const ticketId = randomUUID();
      const version = 1;

      const payloadToSign = `${params.event_id}|${ticketId}|${version}`;
      const sig = createSignature(payloadToSign, secretKey);

      const qrPayload = JSON.stringify({
        v: version,
        eid: params.event_id,
        tid: ticketId,
        sig: sig,
      });
      
      const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
      const shortCode = base32Encode(shortCodeSource).substring(0, 7);

      tickets.push({
        ticketNumber,
        ticketId,
        qrPayload,
        shortCode,
      });
    }

    // Create a new object for the result to avoid passing the starting_ticket_number
    const eventParamsResult: EventParameters = {
        event_name: params.event_name,
        event_id: params.event_id,
        date_time: params.date_time,
        venue: params.venue,
        quantity: params.quantity,
        tickets_per_page: params.tickets_per_page,
        page_size: params.page_size,
    };

    return {
      success: true,
      data: {
        tickets,
        secretKey,
        eventParams: eventParamsResult,
      },
    };
  } catch (e: any) {
    console.error("Error generating tickets:", e);
    return { success: false, error: e.message || "An unknown error occurred during ticket generation." };
  }
}
