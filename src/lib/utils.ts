
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Copia texto al portapapeles sin lanzar si el navegador lo bloquea. */
export async function copyTextSafe(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function getClientAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function gateValidatorUrl(eventId: string): string {
  return `${getClientAppBaseUrl()}/gate/${eventId}`;
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const element = document.createElement("a");
  const file = new Blob([content], { type: mimeType });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(element.href);
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
    let bits = 0;
    let bitLength = 0;
    let result = '';

    for (const byte of buffer) {
        bits = (bits << 8) | byte;
        bitLength += 8;
        while (bitLength >= 5) {
            result += base32Alphabet[(bits >>> (bitLength - 5)) & 31];
            bitLength -= 5;
        }
    }

    if (bitLength > 0) {
        result += base32Alphabet[(bits << (5 - bitLength)) & 31];
    }
    
    return result;
}

// Correct implementation for Base64 to ArrayBuffer conversion for Web Crypto API
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64); // `atob` is fine here as we are reversing a `btoa` string
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Correct HMAC function using Web Crypto API
export async function createHmacSha256(secret: string, data: string): Promise<string> {
    if (typeof window === 'undefined') return '';
    
    const secretKeyData = base64ToArrayBuffer(secret);
    const dataToSign = new TextEncoder().encode(data);

    const key = await window.crypto.subtle.importKey(
        'raw',
        secretKeyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', key, dataToSign);

    // Take the first 12 bytes of the signature
    const truncatedSignature = signature.slice(0, 12);
    
    // Convert to Base64 and make it URL-safe
    // `btoa` is the reverse of `atob`, converting binary string to base64
    const base64Signature = btoa(String.fromCharCode(...new Uint8Array(truncatedSignature)));
    return base64Signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
