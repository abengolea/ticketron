'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QuantityStepperProps {
  id: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function QuantityStepper({
  id,
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
  ariaLabel = 'Cantidad de entradas',
}: QuantityStepperProps) {
  const upperLimit = Math.max(min, max);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const currentValue = clampValue(value, min, upperLimit);

  useEffect(() => {
    setDraftValue(null);
  }, [value, min, upperLimit]);

  function updateValue(nextValue: number) {
    setDraftValue(null);
    onChange(clampValue(nextValue, min, upperLimit));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.target.value.replace(/\D/g, '');

    if (rawValue === '') {
      setDraftValue('');
      return;
    }

    const nextValue = clampValue(Number.parseInt(rawValue, 10), min, upperLimit);
    setDraftValue(String(nextValue));
    onChange(nextValue);
  }

  return (
    <div className="flex w-full items-stretch">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-12 shrink-0 rounded-r-none"
        onClick={() => updateValue(currentValue - 1)}
        disabled={disabled || currentValue <= min}
        aria-label="Restar una entrada"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-11 rounded-none border-x-0 text-center text-base font-semibold tabular-nums"
        value={draftValue ?? String(currentValue)}
        onChange={handleInputChange}
        onBlur={() => setDraftValue(null)}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-12 shrink-0 rounded-l-none"
        onClick={() => updateValue(currentValue + 1)}
        disabled={disabled || currentValue >= upperLimit}
        aria-label="Sumar una entrada"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
