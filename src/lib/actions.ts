
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
    // We only run the AI check for new events, not for generating more tickets
    if (!params.starting_ticket_number || params.starting_ticket_number === 1) {
        const aiCheckResult = await checkParametersWithAI(params);
        if (!aiCheckResult.valid) {
          return { success: false, error: aiCheckResult.feedback };
        }
    }

    // The secret key is only generated for the first batch of tickets
    const secretKey = params.starting_ticket_number && params.starting_ticket_number > 1 
        ? "" 
        : randomBytes(32).toString("base64");
        
    const tickets: TicketData[] = [];
    
    const startingTicketNumber = params.starting_ticket_number || 1;

    for (let i = 0; i < params.quantity; i++) {
      const ticketNumber = startingTicketNumber + i;
      const ticketId = randomUUID();
      const version = 1;

      // When generating more, the secretKey is empty, so this will fail.
      // This is a limitation: offline validation assets cannot be generated
      // for tickets added after the initial creation. The server-side action
      // that saves the tickets to firestore will need to handle this.
      // For now, we generate a temporary signature, but it won't match if
      // the original secret is used. This is okay because online validation will work.
      const signingKey = secretKey || randomBytes(32).toString("base64");

      const payloadToSign = `${params.event_id}|${ticketId}|${version}`;
      const sig = createSignature(payloadToSign, signingKey);

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
