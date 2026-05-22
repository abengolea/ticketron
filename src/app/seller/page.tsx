'use client';

import { RoleGuard } from '@/components/role-guard';
import { SellerDashboard } from '@/components/seller-dashboard';

export default function SellerPage() {
  return (
    <RoleGuard allowedRoles={['seller']}>
      <SellerDashboard />
    </RoleGuard>
  );
}
