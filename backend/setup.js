#!/usr/bin/env node

/**
 * Setup script to verify backend configuration
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Photo Extractor Backend Setup\n');

// Check required directories
const directories = ['logs', 'uploads'];
console.log('Checking directories...');
directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created ${dir}/`);
  } else {
    console.log(`✓ ${dir}/ exists`);
  }
});

// Check .env file
console.log('\nChecking environment configuration...');
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found');
  console.log('   Run: cp .env.example .env');
  console.log('   Then edit .env with your credentials');
} else {
  console.log('✓ .env file exists');

  // Check required env vars
  require('dotenv').config();
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'S3_BUCKET_NAME',
    'ENCRYPTION_KEY',
  ];

  const missing = required.filter(key => !process.env[key] || process.env[key].includes('your-'));

  if (missing.length > 0) {
    console.log('\n⚠️  Missing or default values in .env:');
    missing.forEach(key => console.log(`   - ${key}`));
    console.log('\n   Please update these values in .env file');
  } else {
    console.log('✓ All required environment variables are set');
  }
}

// Check node_modules
console.log('\nChecking dependencies...');
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('⚠️  node_modules not found');
  console.log('   Run: npm install');
} else {
  console.log('✓ node_modules exists');
}

// Docker check
console.log('\nChecking Docker services...');
const { execSync } = require('child_process');

try {
  execSync('docker ps', { stdio: 'pipe' });

  // Check for our containers
  const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });

  const hasPostgres = containers.includes('photo-extractor-db');
  const hasRedis = containers.includes('photo-extractor-redis');

  if (hasPostgres) {
    console.log('✓ PostgreSQL container running');
  } else {
    console.log('⚠️  PostgreSQL container not running');
    console.log('   Run: docker-compose up -d');
  }

  if (hasRedis) {
    console.log('✓ Redis container running');
  } else {
    console.log('⚠️  Redis container not running');
    console.log('   Run: docker-compose up -d');
  }
} catch (error) {
  console.log('⚠️  Docker not running or not installed');
  console.log('   Install Docker Desktop or start Docker daemon');
}

console.log('\n' + '='.repeat(50));
console.log('Setup check complete!');
console.log('='.repeat(50));
console.log('\nNext steps:');
console.log('1. Fix any warnings above');
console.log('2. Run: npm run dev (API server)');
console.log('3. Run: npm run worker:dev (Background worker)');
console.log('4. Test: curl http://localhost:3000/api/health');
console.log('');
