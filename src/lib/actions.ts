
"use server";

import { createHmac, randomBytes, randomUUID } from "crypto";
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { checkParametersWithAI } from "@/ai/flows/check-parameters-with-ai";
import type { EventParameters, TicketData, GenerationResult } from "./types";
import { base32Encode } from "./utils";

// --- Firebase Admin Initialization ---
let adminApp: App;
if (!getApps().length) {
  try {
    // This works in App Hosting by using the runtime service account
    adminApp = initializeApp();
  } catch (e) {
    console.error("Failed to initialize Firebase Admin SDK automatically", e);
    // Fallback for local dev if GOOGLE_APPLICATION_CREDENTIALS is set
    adminApp = initializeApp();
  }
} else {
  adminApp = getApps()[0];
}
const db = getFirestore(adminApp);
// ------------------------------------

function createSignature(payload: string, secretKey: string): string {
  const hmac = createHmac("sha256", Buffer.from(secretKey, "base64"));
  hmac.update(payload);
  return hmac.digest().slice(0, 12).toString("base64url");
}

async function getSecretKeyForEvent(eventId: string): Promise<string> {
    const secretRef = db.collection('event_secrets').doc(eventId);
    const doc = await secretRef.get();
    if (doc.exists) {
        const data = doc.data();
        if (data && data.secretKey) {
          return data.secretKey;
        }
    }
    // If not, create, store, and return a new one
    const newSecretKey = randomBytes(32).toString('base64');
    await secretRef.set({ secretKey: newSecretKey });
    return newSecretKey;
}

export async function generateTicketsAction(
  params: EventParameters & { starting_ticket_number?: number }
): Promise<{ success: true; data: GenerationResult } | { success: false; error: string }> {
  try {
    const isAddingTickets = !!params.starting_ticket_number && params.starting_ticket_number > 1;

    // We only run the AI check for brand new events, not when adding more tickets.
    if (!isAddingTickets) {
        const aiCheckResult = await checkParametersWithAI(params);
        if (!aiCheckResult.valid) {
          return { success: false, error: aiCheckResult.feedback };
        }
    }
    
    const secretKey = await getSecretKeyForEvent(params.event_id);
        
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

    // --- Database Transaction ---
    const eventRef = db.collection('events').doc(params.event_id);
    const ticketsCollectionRef = eventRef.collection('tickets');

    await db.runTransaction(async (transaction) => {
        const eventDoc = await transaction.get(eventRef);

        if (!isAddingTickets) {
            // This is a new event
            if (eventDoc.exists) {
                throw new Error("El ID del evento ya existe. Por favor, usa uno diferente.");
            }
            transaction.set(eventRef, {
                eventName: params.event_name,
                dateTime: params.date_time,
                venue: params.venue,
                ticketCount: params.quantity,
                createdAt: FieldValue.serverTimestamp()
            });
        } else {
            // This is an existing event, we are adding more tickets
             if (!eventDoc.exists) {
                throw new Error("No se encontró el evento para agregarle tickets. Verifica el ID del evento.");
            }
            transaction.update(eventRef, {
                ticketCount: FieldValue.increment(params.quantity)
            });
        }

        // Add the new tickets to the subcollection in a single batch within the transaction
        const batch = db.batch();
        for (const ticket of tickets) {
            const ticketRef = ticketsCollectionRef.doc(ticket.ticketId);
            batch.set(ticketRef, {
                ticketNumber: ticket.ticketNumber,
                shortCode: ticket.shortCode,
                redeemed: false,
                redeemedAt: null,
            });
        }
        // This batch will be committed as part of the transaction
    });
    // --- End Transaction ---

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
        secretKey: isAddingTickets ? "" : secretKey,
        eventParams: eventParamsResult,
      },
    };
  } catch (e: any) {
    console.error("Error in generateTicketsAction:", e);
    return { success: false, error: e.message || "Un error desconocido ocurrió durante la generación de tickets." };
  }
}
