const https = require('https');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();

// Serve static files from build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle React routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Create self-signed certificate for local development
const cert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQC8w9X/2b2C5TANBgkqhkiG9w0BAQsFADASMRAwDgYDVQQDDAcx
MC4wLjAuMTAeFw0yNTA5MTIwMDAwMDBaFw0yNjA5MTIwMDAwMDBaMBIxEDAOBgNV
BAMMB3NlbGZzaWduMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2eP7
+example+certificate+data+here+this+is+just+placeholder+text+for+demo
-----END CERTIFICATE-----`;

const key = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDZ4/v7+example
+private+key+data+here+this+is+just+placeholder+text+for+demo+purposes
-----END PRIVATE KEY-----`;

// For now, let's use HTTP but with proper headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://10.0.0.118:${port}`);
});
