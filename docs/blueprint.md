# **App Name**: Ticketron

## Core Features:

- Ticket Generation: Generate 1000 unique tickets with QR codes, ticket numbers, event details, and a short verification code, saving the secret key to a separate file.
- QR Code Encoding: Encode event details and a truncated HMAC-SHA256 signature into a QR code for each ticket. Payload includes version, event_id, ticket_id, and sig. HMAC-SHA256 uses a high-entropy 32-byte secret key.
- Printable Ticket Layout: Create a PDF layout with four tickets per A4 page, including cutting guides, ensuring each ticket displays the event name, date, time, venue, QR code, ticket number, short verification code, and disclaimers, optimizing for home printing.
- Data Export: Generate a CSV file ('tickets.csv') containing ticket details, QR code payloads, and sheet positions. Create 'valid_tickets.json' for offline validation and provide a README with validation instructions.
- Offline Validation Script: Provide a command-line script ('validate_ticket.(py|js)') to validate tickets offline, recalculate HMAC signatures, check for 'consumed' status, and update a local file ('redeemed.json'). Also, provide a manual validation option using a CSV spreadsheet.
- Parameter Configuration: Allow users to edit event parameters, ensuring the integrity of the data and processes; the AI acts as a tool here, guaranteeing all aspects are covered, and to produce valid tickets according to user defined inputs, even when those might seem contradictory.

## Style Guidelines:

- Primary color: Dark purple (#4B0082) to convey exclusivity and sophistication, aligning with a private party.
- Background color: Very light grey (#F0F0F0), nearly desaturated, provides a subtle contrast.
- Accent color: Bright pink (#FF69B4), a contrasting analogous hue, for highlights and key information to draw the eye.
- Font: 'Inter' (sans-serif) for body text, chosen for its modern and clear readability in both print and digital formats, alongside 'Belleza' for headings.
- Four tickets per A4 sheet with thin cutting guides; high contrast for readability; ample margins for home printers.
- Use a simple QR code for ticket validation.