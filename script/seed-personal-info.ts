import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function seedDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  try {
    const res = await client.query(`
      INSERT INTO "personal_information" DEFAULT VALUES;
    `);
    console.log('Seed data inserted successfully.');
  } catch (error) {
    console.error('Error inserting seed data:', error);
  } finally {
    await client.end();
  }
}

seedDb();
