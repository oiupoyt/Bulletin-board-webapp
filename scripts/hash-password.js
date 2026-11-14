#!/usr/bin/env node
import { hashPassword } from '../src/auth.js';

const password = process.argv[2];

if (!password) {
  console.log('Usage: node scripts/hash-password.js <your-password>');
  console.log('Example: node scripts/hash-password.js mySecretPass123');
  process.exit(1);
}

const hash = hashPassword(password);
console.log('\n--- Admin Password Hash Generated ---');
console.log('Password:', password);
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('\nCopy and paste the line above into your .env file:');
console.log('ADMIN_PASSWORD_HASH=' + hash + '\n');
