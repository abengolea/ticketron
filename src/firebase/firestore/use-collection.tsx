"use client"
import { useEffect, useState, useRef } from 'react';
import { onSnapshot, query, collection, where, getDocs, Query, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

interface UseCollectionOptions {
  live?: boolean;
}

export function useCollection<T>(
  path: string | null | undefined,
  options: UseCollectionOptions = { live: true }
) {
  const [data, setData] = useState<T[] | null>(null);
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

    const collectionQuery = collection(firestore, pathRef.current) as Query<DocumentData>;

    if (options.live) {
      const unsubscribe = onSnapshot(
        collectionQuery,
        (snapshot) => {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
          setData(docs);
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
      getDocs(collectionQuery)
        .then((snapshot) => {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
          setData(docs);
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
