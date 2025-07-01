#!/usr/bin/env node

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// Initialize Firebase Admin with emulator settings
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';

console.log('Provisioning Firebase emulator with base data...');
console.log('Connecting to Firestore emulator at localhost:8080');

// Read service account
const serviceAccountPath = resolve(homedir(), 'firestore.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('Error reading service account from ~/firestore.json:', error.message);
  console.error('Please ensure you have a valid service account file at ~/firestore.json');
  process.exit(1);
}

// Initialize app for emulator
initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id || 'castor-form-shot'
});

const db = getFirestore();

// Define allowed domains to provision
const allowedDomains = [
  {
    domain: 'castoredc.com',
    enabled: true,
    description: 'Castor EDC',
    addedDate: new Date()
  },
  {
    domain: 'gmail.com',
    enabled: true,
    description: 'Gmail users (for testing)',
    addedDate: new Date()
  }
];

async function provisionAllowedDomains() {
  console.log('\nProvisioning allowed-domains collection...');
  
  for (const domainData of allowedDomains) {
    const domainRef = db.collection('allowed-domains').doc(domainData.domain);
    
    try {
      const doc = await domainRef.get();
      if (doc.exists) {
        console.log(`✓ Domain ${domainData.domain} already exists`);
      } else {
        await domainRef.set(domainData);
        console.log(`✓ Added domain: ${domainData.domain}`);
      }
    } catch (error) {
      console.error(`✗ Error adding domain ${domainData.domain}:`, error.message);
    }
  }
}

async function main() {
  try {
    await provisionAllowedDomains();
    
    console.log('\n✅ Emulator provisioning complete!');
    console.log('\nProvisioned collections:');
    console.log('- allowed-domains: Domain-based access control');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Provisioning failed:', error);
    process.exit(1);
  }
}

main();