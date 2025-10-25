"use client";

import { useState, useEffect } from 'react';
import { createHmac } from 'crypto';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, ScanLine, KeyRound, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ValidationResult = {
  status: 'valid' | 'invalid' | 'redeemed';
  message: string;
};

export function TicketValidator() {
  const [secretKey, setSecretKey] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [redeemedTickets, setRedeemedTickets] = useState<Set<string>>(new Set());
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load redeemed tickets from local storage on mount
    try {
      const storedRedeemed = localStorage.getItem('redeemedTickets');
      if (storedRedeemed) {
        setRedeemedTickets(new Set(JSON.parse(storedRedeemed)));
      }
    } catch (error) {
        console.error("Could not parse redeemed tickets from localStorage", error);
        localStorage.removeItem('redeemedTickets');
    }
  }, []);
  
  const handleValidate = () => {
    if (!secretKey.trim() || !qrPayload.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide both a secret key and a QR payload.",
      })
      return;
    }

    try {
      const data = JSON.parse(qrPayload);
      const { v, eid, tid, sig } = data;

      if (!v || !eid || !tid || !sig) {
        setValidationResult({ status: 'invalid', message: 'Invalid QR payload structure.' });
        return;
      }
      
      if (redeemedTickets.has(tid)) {
        setValidationResult({ status: 'redeemed', message: `Ticket ${tid.substring(0,8)}... has already been redeemed.` });
        return;
      }

      const payloadToSign = `${eid}|${tid}|${v}`;
      const hmac = createHmac('sha256', Buffer.from(secretKey, 'base64'));
      hmac.update(payloadToSign);
      const expectedSig = hmac.digest().slice(0, 12).toString('base64url');

      if (expectedSig === sig) {
        setValidationResult({ status: 'valid', message: `Ticket ${tid.substring(0,8)}... is valid for entry.` });
        const newRedeemed = new Set(redeemedTickets).add(tid);
        setRedeemedTickets(newRedeemed);
        localStorage.setItem('redeemedTickets', JSON.stringify(Array.from(newRedeemed)));
      } else {
        setValidationResult({ status: 'invalid', message: 'Invalid signature. Ticket is a forgery or key is incorrect.' });
      }

    } catch (error) {
      setValidationResult({ status: 'invalid', message: 'Failed to parse QR payload. Is it valid JSON?' });
    }
    setQrPayload('');
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Validate Ticket</CardTitle>
        <CardDescription>Enter the secret key and scan a QR code to validate a ticket.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
            <Label htmlFor="secret-key" className='flex items-center gap-2'>
                <KeyRound className='w-4 h-4'/>
                Secret Key
            </Label>
            <Textarea
                id="secret-key"
                placeholder="Paste the 32-byte secret key here"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="font-mono text-sm"
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="qr-payload" className='flex items-center gap-2'>
                <ScanLine className='w-4 h-4' />
                QR Code Payload
            </Label>
            <Textarea
                id="qr-payload"
                placeholder="Paste data from the scanned QR code here"
                value={qrPayload}
                onChange={(e) => setQrPayload(e.target.value)}
                className="font-mono text-sm"
            />
        </div>
        {validationResult && (
          <Alert variant={validationResult.status === 'invalid' ? 'destructive' : 'default'} className={cn({
            'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300': validationResult.status === 'valid',
            'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300': validationResult.status === 'redeemed',
          })}>
            {validationResult.status === 'valid' && <CheckCircle2 className="h-4 w-4" />}
            {validationResult.status === 'redeemed' && <AlertTriangle className="h-4 w-4" />}
            {validationResult.status === 'invalid' && <XCircle className="h-4 w-4" />}
            <AlertTitle className='capitalize'>{validationResult.status}</AlertTitle>
            <AlertDescription>{validationResult.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className='flex-col items-stretch gap-4'>
        <Button onClick={handleValidate} className='w-full'>Validate Ticket</Button>
        <div className="text-xs text-muted-foreground flex items-center gap-4 bg-muted p-3 rounded-lg">
            <p>Redeemed tickets: <span className="font-bold">{redeemedTickets.size}</span></p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
                setRedeemedTickets(new Set());
                localStorage.removeItem('redeemedTickets');
                toast({ title: "Cleared redeemed tickets." });
            }}>Clear Redeemed List</Button>
        </div>
      </CardFooter>
    </Card>
  );
}
