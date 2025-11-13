import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';

// Enhanced and cleaned version (same logic, improved clarity)

export function useOptimizedData<T>(
  collectionName: string,
  filters: Record<string, any> = {},
  options: any = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refetch = () => setVersion(v => v + 1);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    if (options.skip) {
      setLoading(false);
      setData([]);
      return;
    }

    const setupListener = () => {
      setLoading(true);
      setError(null);

      try {
        let q: any = collection(db, collectionName);
        console.log('[useOptimizedData] filters:', filters);
        console.log('[useOptimizedData] collectionName:', collectionName, 'options:', options);

        // Handle large 'companyId in [...]' filters
        if (
          options.userRole !== 'admin' &&
          options.userRole !== 'manager' &&
          Array.isArray(filters.companyId) &&
          filters.companyId.length > 10
        ) {
          console.log('[useOptimizedData] chunking companyId in query:', filters.companyId);
          const chunks: string[][] = [];
          for (let i = 0; i < filters.companyId.length; i += 10) {
            chunks.push(filters.companyId.slice(i, i + 10));
          }

          const unsubscribes: (() => void)[] = [];
          let allDocs: any[] = [];

          chunks.forEach(chunk => {
            console.log('[useOptimizedData] setting up chunk listener:', chunk);
            const qChunk = query(collection(db, collectionName), where('companyId', 'in', chunk));
            
            const unsub = onSnapshot(qChunk, (snapshot: QuerySnapshot<DocumentData>) => {
              console.log('[useOptimizedData] chunk listener update for', chunk, ':', snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
              
              // Merge all chunk results
              allDocs = [];
              chunks.forEach(() => {
                // This will be handled by the listener
              });
              
              // Re-fetch all chunks to get complete data
              Promise.all(chunks.map(c => getDocs(query(collection(db, collectionName), where('companyId', 'in', c)))))
                .then(snapshots => {
                  const mergedDocs = snapshots.flatMap(snap =>
            snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }))
          );

                  console.log('[useOptimizedData] allDocs after chunking:', mergedDocs);
          
          if (collectionName === 'companies') {
                    mergedDocs.forEach(company => {
              console.log(`[useOptimizedData] Chunked company ${company.id} data:`, company);
              console.log(`[useOptimizedData] Chunked company ${company.id} divisions field:`, company.divisions);
            });
          }
                  
                  if (isMounted) {
                    setData(mergedDocs as T[]);
                    setLoading(false);
                  }
                });
            });
            
            unsubscribes.push(unsub);
          });

          unsubscribe = () => unsubscribes.forEach(unsub => unsub());
          return;
        }

        // Handle any generic array-based filter with chunking (like 'in' on another field)
        const arrayFilter = Object.entries(filters).find(([_, value]) => Array.isArray(value));
        if (arrayFilter) {
          const [inKey, arr] = arrayFilter;
          if (!arr || arr.length === 0) {
            if (isMounted) {
              setData([]);
              setLoading(false);
            }
            return;
          }

          const chunkSize = 10;
          const chunks: any[][] = [];
          for (let i = 0; i < arr.length; i += chunkSize) {
            chunks.push(arr.slice(i, i + chunkSize));
          }

          const unsubscribes: (() => void)[] = [];

          chunks.forEach(chunk => {
            let qChunk: any = q;

            // Apply other filters (non-array)
            Object.entries(filters).forEach(([key, value]) => {
              if (key !== inKey && value !== undefined && value !== null) {
                qChunk = query(qChunk, where(key, '==', value));
              }
            });

            qChunk = query(qChunk, where(inKey, 'in', chunk));
            console.log('[useOptimizedData] setting up generic array chunk listener:', inKey, chunk);
            
            const unsub = onSnapshot(qChunk, (snapshot: QuerySnapshot<DocumentData>) => {
              console.log('[useOptimizedData] generic chunk listener update for', chunk, ':', snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
              
              // Re-fetch all chunks to get complete data
              Promise.all(chunks.map(c => {
                let qChunkInner: any = q;
                Object.entries(filters).forEach(([key, value]) => {
                  if (key !== inKey && value !== undefined && value !== null) {
                    qChunkInner = query(qChunkInner, where(key, '==', value));
                  }
                });
                qChunkInner = query(qChunkInner, where(inKey, 'in', c));
                return getDocs(qChunkInner);
              }))
                .then(snapshots => {
                  const allDocs = snapshots.flatMap(snap => snap.docs);
          const uniqueDocs = Array.from(new Map(allDocs.map(doc => [doc.id, doc])).values());
          const result = uniqueDocs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

          console.log('[useOptimizedData] allDocs after generic chunking:', result);
                  if (isMounted) {
                    setData(result as T[]);
                    setLoading(false);
                  }
                });
            });
            
            unsubscribes.push(unsub);
          });

          unsubscribe = () => unsubscribes.forEach(unsub => unsub());
          return;
        }

        // Simple filter with only direct values
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            q = query(q, where(key, '==', value));
          }
        });

        console.log('[useOptimizedData] setting up real-time listener:', filters);
        
        unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
          console.log('[useOptimizedData] real-time listener update:', snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
          
        if (collectionName === 'companies') {
          snapshot.docs.forEach(doc => {
            const data = doc.data() as any;
            console.log(`[useOptimizedData] Company ${doc.id} raw data:`, data);
            console.log(`[useOptimizedData] Company ${doc.id} divisions field:`, data.divisions);
          });
        }
        
        const result = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as T[];

          if (isMounted) {
            setData(result);
            setLoading(false);
          }
        }, (err: Error) => {
          console.error('[useOptimizedData] listener error:', err);
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setLoading(false);
          }
        });
      } catch (err) {
        console.error('[useOptimizedData] setup error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      }
    };

    setupListener();
    
    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [collectionName, JSON.stringify(filters), version, options.skip]);

  return { data, loading, error, refetch };
} 
