import { Client } from 'pg';

const client = new Client({
  host: '3.23.109.155', // The exact IP that succeeded in your nc test!
  port: 5432,
  user: 'neondb_owner',
  password: 'npg_4rzSxEbJ6uMd',
  database: 'neondb',
  ssl: {
    rejectUnauthorized: false, // Prevents strict CA checks that sometimes hang on proxies/VPNs
    servername: 'ep-calm-haze-ay4vinon.c-5.us-east-2.aws.neon.tech' // Required for Neon's SSL/SNI
  },
  connectionTimeoutMillis: 15000,
});

async function test() {
  try {
    console.log('Connecting directly to 3.23.109.155 with explicit SSL...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const res = await client.query('SELECT version()');
    console.log('Database Version:', res.rows[0].version);
    
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed!');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
  }
}

test();