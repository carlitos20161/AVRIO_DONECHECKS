import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface PrintPermissions {
  canPrintChecks: boolean;
  loading: boolean;
  error: string | null;
}

export const usePrintPermissions = (): PrintPermissions => {
  const [canPrintChecks, setCanPrintChecks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          setCanPrintChecks(false);
          setLoading(false);
          return;
        }

        // Get user document from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setCanPrintChecks(userData.canPrintChecks ?? false);
        } else {
          setCanPrintChecks(false);
        }
      } catch (err) {
        console.error('Error checking print permissions:', err);
        setError('Failed to check printing permissions');
        setCanPrintChecks(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, []);

  return {
    canPrintChecks,
    loading,
    error
  };
}; 