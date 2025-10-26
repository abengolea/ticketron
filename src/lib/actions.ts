
"use server";

import { createHmac, randomBytes, randomUUID } from "crypto";
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { checkParametersWithAI } from "@/ai/flows/check-parameters-with-ai";
import type { EventParameters, TicketData, GenerationResult } from "./types";
import { base32Encode } from "./utils";

// --- Firebase Admin Initialization ---
let adminApp: App;
if (!getApps().length) {
  try {
    adminApp = initializeApp();
  } catch (e) {
    console.error("Failed to initialize Firebase Admin SDK automatically", e);
    // In many environments, the SDK can be initialized without arguments.
    // If that fails, it might need specific credentials.
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
    const newSecretKey = randomBytes(32).toString('base64');
    await secretRef.set({ secretKey: newSecretKey });
    return newSecretKey;
}

/**
 * This function ONLY deals with Firestore. It has no contact with Genkit.
 * This avoids authentication conflicts.
 */
async function addTicketsToEvent(
    params: EventParameters & { starting_ticket_number: number }
): Promise<GenerationResult> {
    const secretKey = await getSecretKeyForEvent(params.event_id);
    const tickets: TicketData[] = [];
    const startingTicketNumber = params.starting_ticket_number;

    for (let i = 0; i < params.quantity; i++) {
        const ticketNumber = startingTicketNumber + i;
        const ticketId = randomUUID();
        const version = 1;
        const payloadToSign = `${params.event_id}|${ticketId}|${version}`;
        const sig = createSignature(payloadToSign, secretKey);
        const qrPayload = JSON.stringify({ v: version, eid: params.event_id, tid: ticketId, sig: sig });
        const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
        const shortCode = base32Encode(shortCodeSource).substring(0, 7);
        tickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
    }

    const eventRef = db.collection('events').doc(params.event_id);
    const ticketsCollectionRef = eventRef.collection('tickets');

    // Batch write tickets
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
    // Increment the total ticket count on the event document
    batch.update(eventRef, { ticketCount: FieldValue.increment(params.quantity) });
    await batch.commit();

    return {
        tickets,
        secretKey: "", // Never expose secret key on subsequent generations
        eventParams: params,
    };
}


export async function generateTicketsAction(
  params: EventParameters & { starting_ticket_number?: number }
): Promise<{ success: true; data: GenerationResult } | { success: false; error: string }> {
  try {
    // --- ROUTE 1: ADDING TICKETS TO EXISTING EVENT ---
    // If a starting_ticket_number is provided, it means we are adding tickets.
    // This path bypasses the AI validation completely to avoid auth conflicts.
    const isAddingTickets = !!params.starting_ticket_number && params.starting_ticket_number > 1;

    if (isAddingTickets) {
      console.log(`Adding ${params.quantity} tickets to event ${params.event_id}...`);
      const data = await addTicketsToEvent(params as EventParameters & { starting_ticket_number: number });
      return { success: true, data };
    }

    // --- ROUTE 2: CREATING A NEW EVENT ---
    // This path is for brand new events and includes AI validation.
    console.log(`Creating new event ${params.event_id}...`);
    
    // Step 1: Validate parameters with AI
    const aiCheckResult = await checkParametersWithAI(params);
    if (!aiCheckResult.valid) {
      return { success: false, error: aiCheckResult.feedback };
    }
    
    // Step 2: Get or create the secret key
    const secretKey = await getSecretKeyForEvent(params.event_id);
        
    // Step 3: Generate ticket data locally
    const tickets: TicketData[] = [];
    const startingTicketNumber = 1;

    for (let i = 0; i < params.quantity; i++) {
      const ticketNumber = startingTicketNumber + i;
      const ticketId = randomUUID();
      const version = 1;
      const payloadToSign = `${params.event_id}|${ticketId}|${version}`;
      const sig = createSignature(payloadToSign, secretKey);
      const qrPayload = JSON.stringify({ v: version, eid: params.event_id, tid: ticketId, sig });
      const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
      const shortCode = base32Encode(shortCodeSource).substring(0, 7);
      tickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
    }

    // Step 4: Save event and tickets to Firestore
    const eventRef = db.collection('events').doc(params.event_id);
    const ticketsCollectionRef = eventRef.collection('tickets');

    // Use a transaction to ensure the event doesn't already exist
    await db.runTransaction(async (transaction) => {
        const eventDoc = await transaction.get(eventRef);
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
    });

    // Batch write tickets outside the transaction for performance
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
    await batch.commit();

    return {
      success: true,
      data: {
        tickets,
        secretKey: secretKey,
        eventParams: params,
      },
    };
  } catch (e: any) {
    console.error("Error in generateTicketsAction:", e);
    return { success: false, error: e.message || "Un error desconocido ocurrió durante la generación de tickets." };
  }
}
