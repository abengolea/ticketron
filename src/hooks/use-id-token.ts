'use client';

import { useCallback } from 'react';
import { useUser } from '@/firebase';

export function useIdToken() {
  const { user } = useUser();

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  return { getIdToken, user };
}
