import {defineConfig} from 'drizzle-kit';
export default defineConfig({schema:'./farm/schema.ts',out:'./drizzle',dialect:'postgresql',dbCredentials:{url:process.env.NEON_BASE||process.env.DATABASE_URL||''},strict:true});
