import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from "firebase/storage";




const firebaseConfig = {
    apiKey: "AIzaSyBHrcCDTG4hkX2u9fwGM7b4cUmniy11bYU",
    authDomain: "checks-6fc3e.firebaseapp.com",
    projectId: "checks-6fc3e",
    storageBucket: "checks-6fc3e.firebasestorage.app",
    messagingSenderId: "1056189255628",
    appId: "1:1056189255628:web:cf495959e597ea77f61769",
    measurementId: "G-NK6GTJJCN3"
  };
  

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); 
export const storage = getStorage(app);