const fs = require('fs');
const path = require('path');

// Generate version.json with current timestamp
const versionData = {
  version: process.env.npm_package_version || '1.0.0',
  buildTime: new Date().toISOString()
};

const versionPath = path.join(__dirname, '../public/version.json');
fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2));
console.log('✅ Version file updated:', versionData);











