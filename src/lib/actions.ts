
"use server";

import { createHmac, randomBytes, randomUUID } from "crypto";
import { initializeApp, getApps, App, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { EventParameters, TicketData, GenerationResult } from "./types";
import { base32Encode } from "./utils";

// --- Firebase Admin Initialization ---
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp();
} else {
  // Delete the existing app to ensure a clean state, then re-initialize
  // This helps prevent potential auth context conflicts in hot-reload environments
  deleteApp(getApps()[0]);
  adminApp = initializeApp();
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

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

export async function generateTicketsAction(
  params: EventParameters & { starting_ticket_number?: number }
): Promise<{ success: true; data: GenerationResult } | { success: false; error: string }> {
  try {
    const isAddingTickets = !!params.starting_ticket_number && params.starting_ticket_number > 1;

    // --- ROUTE 1: ADDING TICKETS TO EXISTING EVENT ---
    if (isAddingTickets) {
        const secretKey = await getSecretKeyForEvent(params.event_id);
        const tickets: TicketData[] = [];
        
        for (let i = 0; i < params.quantity; i++) {
            const ticketNumber = params.starting_ticket_number! + i;
            const ticketId = randomUUID();
            const version = 1;
            const payloadToSign = `${params.event_id}|${ticketId}|${version}`;
            const sig = createSignature(payloadToSign, secretKey);
            const qrPayload = JSON.stringify({ v: version, eid: params.event_id, tid: ticketId, sig });
            const shortCodeSource = Buffer.from(ticketId.substring(0, 8) + sig.substring(0, 4));
            const shortCode = base32Encode(shortCodeSource).substring(0, 7);
            tickets.push({ ticketNumber, ticketId, qrPayload, shortCode });
        }
    
        const eventRef = db.collection('events').doc(params.event_id);
        const ticketsCollectionRef = eventRef.collection('tickets');

        const ticketChunks = chunk(tickets, 499);
          
        for (const ticketChunk of ticketChunks) {
            const batch = db.batch();
            for (const ticket of ticketChunk) {
                const ticketRef = ticketsCollectionRef.doc(ticket.ticketId);
                batch.set(ticketRef, {
                    ticketNumber: ticket.ticketNumber,
                    shortCode: ticket.shortCode,
                    redeemed: false,
                    redeemedAt: null,
                });
            }
            await batch.commit();
        }
        
        await eventRef.update({ ticketCount: FieldValue.increment(params.quantity) });

        return {
            success: true,
            data: {
                tickets,
                secretKey: "", // Never expose secret key on subsequent generations
                eventParams: params,
            },
        };
    }

    // --- ROUTE 2: CREATING A NEW EVENT ---
    // No AI validation anymore. Directly generate tickets.
    
    // Step 1: Get or create the secret key
    const secretKey = await getSecretKeyForEvent(params.event_id);
        
    // Step 2: Generate ticket data locally
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

    // Step 3: Save event and tickets to Firestore
    const eventRef = db.collection('events').doc(params.event_id);
    const ticketsCollectionRef = eventRef.collection('tickets');

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

    const ticketChunks = chunk(tickets, 499);
      
    for (const ticketChunk of ticketChunks) {
        const batch = db.batch();
        for (const ticket of ticketChunk) {
            const ticketRef = ticketsCollectionRef.doc(ticket.ticketId);
            batch.set(ticketRef, {
                ticketNumber: ticket.ticketNumber,
                shortCode: ticket.shortCode,
                redeemed: false,
                redeemedAt: null,
            });
        }
        await batch.commit();
    }
    
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
