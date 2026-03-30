import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const databaseUrl =
	process.env.DATABASE_URL.startsWith('/data/') &&
	!existsSync('/.dockerenv') &&
	!existsSync(dirname(process.env.DATABASE_URL))
		? resolve(process.cwd(), process.env.DATABASE_URL.slice(1))
		: process.env.DATABASE_URL;

if (databaseUrl !== ':memory:' && !databaseUrl.startsWith('file:')) {
	mkdirSync(dirname(databaseUrl), { recursive: true });
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: databaseUrl },
	verbose: true,
	strict: true
});
