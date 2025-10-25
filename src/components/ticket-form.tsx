"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { generateTicketsAction } from "@/lib/actions";
import type { GenerationResult } from "@/lib/types";

const formSchema = z.object({
  event_name: z.string().min(3, "Event name must be at least 3 characters."),
  event_id: z.string().min(3, "Event ID must be at least 3 characters."),
  date_time: z.string().min(5, "Date/Time is required."),
  venue: z.string().min(3, "Venue is required."),
  quantity: z.coerce.number().int().positive().max(1000, "Quantity cannot exceed 1000."),
  tickets_per_page: z.literal(4),
  page_size: z.enum(["A4", "Letter"]),
});

type TicketFormProps = {
  onGenerate: (result: GenerationResult | null, error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
};

export function TicketForm({ onGenerate, setIsLoading }: TicketFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      event_name: "Fiesta +40 — San Nicolás",
      event_id: "SN-FIESTA-2025-12-20",
      date_time: "Sábado 20/12/2025 – 22:00 hs",
      venue: "A informar por WhatsApp",
      quantity: 1000,
      tickets_per_page: 4,
      page_size: "A4",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    onGenerate(null, null);
    const result = await generateTicketsAction(values);
    if (result.success) {
      onGenerate(result.data, null);
    } else {
      onGenerate(null, result.error);
    }
    setIsLoading(false);
  }

  async function onTestSubmit() {
    const values = form.getValues();
    const testValues = { ...values, quantity: 10 };
    
    // Quick validation before submitting
    const validation = formSchema.safeParse(testValues);
    if (!validation.success) {
      // Trigger validation to show errors
      form.trigger();
      return;
    }
    
    setIsLoading(true);
    onGenerate(null, null);
    const result = await generateTicketsAction(testValues);
    if (result.success) {
      onGenerate(result.data, null);
    } else {
      onGenerate(null, result.error);
    }
    setIsLoading(false);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Event Parameters</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="event_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., My Awesome Party" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="event_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., MY-PARTY-2024" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date and Time</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Dec 25, 2024 - 9:00 PM" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Venue</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 123 Main St, Anytown" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity of Tickets</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>Max 1000 tickets.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-6">
                <FormField
                control={form.control}
                name="tickets_per_page"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Tickets per Page</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={String(field.value)} disabled>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="page_size"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Page Size</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="A4">A4</SelectItem>
                            <SelectItem value="Letter">Letter</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>

          </CardContent>
          <CardFooter className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={onTestSubmit}>Generate 10 Test Tickets</Button>
            <Button type="submit">Generate Tickets</Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
