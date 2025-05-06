import CryptoJS from 'crypto-js';

export const encryptData = (data) => {
  const key = sessionStorage.getItem('cryptoKey');
  if (!key) throw new Error('No encryption key found');
  return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
};

export const decryptData = (encryptedData) => {
  const key = sessionStorage.getItem('cryptoKey');
  if (!key) throw new Error('No encryption key found');
  const bytes = CryptoJS.AES.decrypt(encryptedData, key);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};