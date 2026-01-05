import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { logger } from './utils/logger';
import { saveLoginTime } from './utils/sessionTimeout';

// reCAPTCHA Enterprise Site Key
const RECAPTCHA_SITE_KEY = '6LfHiTMsAAAAABZxCRgqcN8DQTquuq9FlhxU_2rR';

// Rate limiting: Track failed attempts per IP/email
const FAILED_ATTEMPT_LIMIT = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

interface FailedAttempt {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [isUserInactive, setIsUserInactive] = useState(false);
  const failedAttemptsRef = useRef<Map<string, FailedAttempt>>(new Map());

  // Check lockout status on mount
  useEffect(() => {
    const checkLockout = () => {
      const attempts = failedAttemptsRef.current.get(email.toLowerCase());
      if (attempts?.lockedUntil && attempts.lockedUntil > Date.now()) {
        setIsLocked(true);
        setLockoutTime(Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60));
      } else if (attempts?.lockedUntil && attempts.lockedUntil <= Date.now()) {
        // Lockout expired, reset
        failedAttemptsRef.current.delete(email.toLowerCase());
        setIsLocked(false);
        setLockoutTime(0);
      }
    };

    if (email) {
      checkLockout();
      const interval = setInterval(checkLockout, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [email]);

  // Real-time check for user active status when email is entered
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setIsUserInactive(false);
      return;
    }

    logger.log('🔍 Setting up real-time listener for user active status on login page');
    
    // Query users collection by email
    const q = query(
      collection(db, 'users'),
      where('email', '==', email.toLowerCase().trim())
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // User doesn't exist yet, clear inactive status
        setIsUserInactive(false);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = userDoc.data();
      const isActive = userData.active !== false; // Default to true if not set
      
      if (!isActive) {
        logger.warn('⚠️ User is inactive, showing warning on login page');
        setIsUserInactive(true);
        setError('This account has been deactivated. Please contact your administrator.');
      } else {
        setIsUserInactive(false);
      }
    }, (error) => {
      console.error('Error listening to user document:', error);
    });

    return () => {
      logger.log('🔍 Cleaning up user active status listener on login page');
      unsubscribe();
    };
  }, [email]);

  const getRecaptchaToken = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!window.grecaptcha || !window.grecaptcha.enterprise) {
        logger.warn('reCAPTCHA not loaded');
        resolve(null);
        return;
      }

      window.grecaptcha.enterprise.ready(() => {
        window.grecaptcha.enterprise
          .execute(RECAPTCHA_SITE_KEY, { action: 'LOGIN' })
          .then((token: string) => {
            logger.log('✅ reCAPTCHA token obtained successfully (length:', token.length, ')');
            // Token is a long string - if we got it, reCAPTCHA is working!
            resolve(token);
          })
          .catch((error: any) => {
            logger.error('❌ reCAPTCHA error:', error);
            resolve(null);
          });
      });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const emailKey = email.toLowerCase();

    // Check if account is locked
    const attempts = failedAttemptsRef.current.get(emailKey);
    if (attempts?.lockedUntil && attempts.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60);
      setError(`Too many failed attempts. Please try again in ${minutesLeft} minute(s).`);
      setLoading(false);
      setIsLocked(true);
      setLockoutTime(minutesLeft);
      return;
    }

    try {
      // Get reCAPTCHA token before login
      const recaptchaToken = await getRecaptchaToken();
      if (!recaptchaToken) {
        logger.warn('⚠️ reCAPTCHA token not obtained, proceeding with login anyway');
        // Continue with login even if reCAPTCHA fails (graceful degradation)
      } else {
        logger.log('✅ reCAPTCHA is WORKING! Token generated:', recaptchaToken.substring(0, 20) + '...');
        // In production, you could send this token to your backend for verification
        // For now, Firebase Auth will handle the security
      }

      await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user is active
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const isActive = userData.active !== false; // Default to true if not set
          
          if (!isActive) {
            // User is inactive, sign them out immediately
            await auth.signOut();
            setError('This account has been deactivated. Please contact your administrator.');
            setLoading(false);
            return;
          }
        }
      }
      
      // Successful login - reset failed attempts and start session timer
      failedAttemptsRef.current.delete(emailKey);
      setIsLocked(false);
      setLockoutTime(0);
      saveLoginTime(); // Start 24-hour session timer
      logger.log('Successful login:', email);
      onLogin();
    } catch (err: any) {
      logger.error('Login error:', err);
      
      // Handle failed login attempts
      const currentAttempts = failedAttemptsRef.current.get(emailKey) || { count: 0, lastAttempt: 0 };
      currentAttempts.count += 1;
      currentAttempts.lastAttempt = Date.now();

      // Lock account after too many failed attempts
      if (currentAttempts.count >= FAILED_ATTEMPT_LIMIT) {
        currentAttempts.lockedUntil = Date.now() + LOCKOUT_DURATION;
        setIsLocked(true);
        setLockoutTime(Math.ceil(LOCKOUT_DURATION / 1000 / 60));
        setError(`Too many failed login attempts. Account locked for ${Math.ceil(LOCKOUT_DURATION / 1000 / 60)} minutes.`);
      } else {
        const remainingAttempts = FAILED_ATTEMPT_LIMIT - currentAttempts.count;
        // Generic error message to avoid exposing account existence
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          setError(`Invalid email or password. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : ''}`);
        } else if (err.code === 'auth/too-many-requests') {
          setError('Too many requests. Please try again later.');
        } else if (err.code === 'auth/user-disabled') {
          setError('This account has been disabled. Please contact support.');
        } else {
          setError('Login failed. Please try again.');
        }
      }

      failedAttemptsRef.current.set(emailKey, currentAttempts);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#f5f5f5">
      <Paper elevation={3} sx={{ p: 4, minWidth: 320 }}>
        <Typography variant="h5" gutterBottom>Login</Typography>
        <form onSubmit={handleSubmit}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          {isUserInactive && (
            <Alert 
              severity="warning" 
              sx={{ mt: 2 }}
            >
              This account has been deactivated. Please contact your administrator.
            </Alert>
          )}
          {error && !isUserInactive && (
            <Alert 
              severity={isLocked ? "warning" : "error"} 
              sx={{ mt: 2 }}
            >
              {error}
            </Alert>
          )}
          {isLocked && lockoutTime > 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Account locked. Please wait {lockoutTime} minute(s) before trying again.
            </Alert>
          )}
          <Box mt={2} position="relative">
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              fullWidth 
              disabled={loading || isLocked || isUserInactive}
            >
              {isLocked ? 'Account Locked' : isUserInactive ? 'Account Deactivated' : 'Login'}
            </Button>
            {loading && <CircularProgress size={24} sx={{ position: 'absolute', top: '50%', left: '50%', mt: '-12px', ml: '-12px' }} />}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
            After 5 failed attempts, your account will be temporarily locked for security.
          </Typography>
        </form>
      </Paper>
    </Box>
  );
};

export default Login; 