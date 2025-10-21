import CryptoJS from 'crypto-js';

// Use a strong secret key - in production, store this in environment variables
const SECRET_KEY = 'your-super-secret-key-change-this-in-production';

export const encryptData = (data: string): string => {
  try {
    const encrypted = CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return data; // Return original data if encryption fails
  }
};

export const decryptData = (encryptedData: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedData; // Return original if decryption fails
  }
};

// Helper function to encrypt bank data
export const encryptBankData = (bankData: {
  routingNumber: string;
  accountNumber: string;
  [key: string]: any;
}) => {
  return {
    ...bankData,
    routingNumber: encryptData(bankData.routingNumber),
    accountNumber: encryptData(bankData.accountNumber),
  };
};

// Helper function to decrypt bank data
export const decryptBankData = (bankData: {
  routingNumber: string;
  accountNumber: string;
  [key: string]: any;
}) => {
  return {
    ...bankData,
    routingNumber: decryptData(bankData.routingNumber),
    accountNumber: decryptData(bankData.accountNumber),
  };
};