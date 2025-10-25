"use client"
import { useEffect, useState, useRef } from 'react';
import { onSnapshot, doc, getDoc, DocumentReference, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

interface UseDocOptions {
  live?: boolean;
}

export function useDoc<T>(
  path: string | null | undefined,
  options: UseDocOptions = { live: true }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const firestore = useFirestore();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!firestore || !pathRef.current) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const docQuery = doc(firestore, pathRef.current) as DocumentReference<DocumentData>;

    if (options.live) {
      const unsubscribe = onSnapshot(
        docQuery,
        (snapshot) => {
          if (snapshot.exists()) {
            setData({ id: snapshot.id, ...snapshot.data() } as T);
          } else {
            setData(null);
          }
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(err);
          setError(err);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    } else {
      getDoc(docQuery)
        .then((snapshot) => {
          if (snapshot.exists()) {
            setData({ id: snapshot.id, ...snapshot.data() } as T);
          } else {
            setData(null);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError(err);
          setLoading(false);
        });
    }
  }, [firestore, options.live]);

  return { data, loading, error };
}
