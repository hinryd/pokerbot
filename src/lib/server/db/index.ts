import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

const databaseUrl =
	env.DATABASE_URL.startsWith('/data/') &&
	!existsSync('/.dockerenv') &&
	!existsSync(dirname(env.DATABASE_URL))
		? resolve(process.cwd(), env.DATABASE_URL.slice(1))
		: env.DATABASE_URL;

if (databaseUrl !== ':memory:' && !databaseUrl.startsWith('file:')) {
	mkdirSync(dirname(databaseUrl), { recursive: true });
}

const client = new Database(databaseUrl);

export const db = drizzle(client, { schema });
