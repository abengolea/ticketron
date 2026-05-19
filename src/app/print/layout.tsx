import PrivateRoute from '@/components/private-route';

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <PrivateRoute>{children}</PrivateRoute>;
}
