
"use server";

import { createHmac, randomBytes, randomUUID } from "crypto";
import { checkParametersWithAI } from "@/ai/flows/check-parameters-with-ai";
import type { EventParameters, TicketData, GenerationResult } from "./types";
import { base32Encode } from "./utils";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, App } from "firebase-admin/app";

// Initialize Firebase Admin SDK
function getFirebaseAdminApp(): App {
    const apps = getApps();
    if (apps.length > 0) {
        return apps[0];
    }
    return initializeApp();
}

const app = getFirebaseAdminApp();
const firestore = getFirestore(app);


function createSignature(payload: string, secretKey: string): string {
  const hmac = createHmac("sha256", Buffer.from(secretKey, "base64"));
  hmac.update(payload);
  return hmac.digest().slice(0, 12).toString("base64url");
}

export async function generateTicketsAction(
  params: EventParameters
): Promise<{ success: true; data: GenerationResult } | { success: false; error: string }> {
  try {
    const aiCheckResult = await checkParametersWithAI(params);

    if (!aiCheckResult.valid) {
      return { success: false, error: aiCheckResult.feedback };
    }

    const secretKey = randomBytes(32).toString("base64");
    const tickets: TicketData[] = [];
    
    // Check for existing event to get the last ticket number
    const eventRef = firestore.collection('events').doc(params.event_id);
    const eventSnap = await eventRef.get();
    
    let startingTicketNumber = 1;
    if (eventSnap.exists) {
        const eventData = eventSnap.data();
        if (eventData && eventData.ticketCount) {
            startingTicketNumber = eventData.ticketCount + 1;
        }
    }


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

    return {
      success: true,
      data: {
        tickets,
        secretKey,
        eventParams: params,
      },
    };
  } catch (e: any) {
    console.error("Error generating tickets:", e);
    return { success: false, error: e.message || "An unknown error occurred during ticket generation." };
  }
}
