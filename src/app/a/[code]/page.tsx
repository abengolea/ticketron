import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ code: string }>;
};

/** Link corto del mail: /a/{code} → activación de cuenta comprador. */
export default async function ShortActivationPage({ params }: PageProps) {
  const { code } = await params;
  redirect(`/activate?code=${encodeURIComponent(code)}`);
}
