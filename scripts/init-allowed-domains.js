#!/usr/bin/env node

/**
 * Initialize allowed domains collection in Firestore
 * This script adds the initial allowed domain(s) to control access to the Form-Shot UI
 * 
 * Usage: node scripts/init-allowed-domains.js
 * 
 * Requires: ~/firestore.json service account file
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Initialize Firebase Admin
const serviceAccountPath = join(homedir(), 'firestore.json');
let serviceAccount;

try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('❌ Error: Could not read service account file from ~/firestore.json');
  console.error('   Please ensure you have the service account JSON file in your home directory');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Define initial allowed domains
const INITIAL_DOMAINS = [
  {
    id: 'castoredc.com',
    data: {
      domain: 'castoredc.com',
      enabled: true,
      addedDate: new Date(),
      description: 'Castor EDC'
    }
  }
];

async function initializeAllowedDomains() {
  console.log('🚀 Initializing allowed domains collection...\n');
  
  const allowedDomainsRef = db.collection('allowed-domains');
  
  for (const domainConfig of INITIAL_DOMAINS) {
    try {
      // Check if domain already exists
      const docRef = allowedDomainsRef.doc(domainConfig.id);
      const doc = await docRef.get();
      
      if (doc.exists) {
        console.log(`⚠️  Domain '${domainConfig.id}' already exists - skipping`);
      } else {
        // Add the domain
        await docRef.set(domainConfig.data);
        console.log(`✅ Added domain: ${domainConfig.id}`);
      }
    } catch (error) {
      console.error(`❌ Error adding domain '${domainConfig.id}':`, error.message);
    }
  }
  
  // List all allowed domains
  console.log('\n📋 Current allowed domains:');
  const snapshot = await allowedDomainsRef.get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`   - ${doc.id} (${data.enabled ? 'enabled' : 'disabled'})${data.description ? ' - ' + data.description : ''}`);
  });
  
  console.log('\n✨ Initialization complete!');
  console.log('\nTo add more domains, you can:');
  console.log('1. Use the Firebase Console to add documents to the "allowed-domains" collection');
  console.log('2. Or modify this script and run it again');
  
  process.exit(0);
}

// Run the initialization
initializeAllowedDomains().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});