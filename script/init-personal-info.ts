import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function initDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const res = await client.query(`
      CREATE TABLE IF NOT EXISTS "personal_information" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text DEFAULT 'Matthew Tujague' NOT NULL,
        "title" text DEFAULT 'Software Engineer' NOT NULL,
        "location" text DEFAULT 'NJ-NY-PA' NOT NULL,
        "short_bio" text DEFAULT 'Based in Middletown NJ with ties across the tri-state, this engineer prefers to scale large systems that promote REAL value.' NOT NULL,
        "email" text DEFAULT 'matthew@2jog.dev' NOT NULL,
        "phone" text DEFAULT '+17326393889' NOT NULL,
        "phone_formatted" text DEFAULT '(732) 639-3889' NOT NULL,
        "linkedin_url" text DEFAULT 'https://linkedin.com/in/matthewtujague' NOT NULL,
        "github_url" text DEFAULT 'https://github.com/binimal101' NOT NULL,
        "devpost_url" text DEFAULT 'https://devpost.com/' NOT NULL,
        "portfolio_url" text DEFAULT 'https://2jog.dev/' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log('Table personal_information created successfully.');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await client.end();
  }
}

initDb();
