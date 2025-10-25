import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
