import {loadEnvConfig} from '@next/env';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

async function main(){
 loadEnvConfig(process.cwd());
 const connectionString=process.env.NEON_BASE||process.env.DATABASE_URL;
 if(!connectionString)throw new Error('Добавьте NEON_BASE или DATABASE_URL в web/.env.local');
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:15000});
 try{await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});console.log('Миграции farm_* применены.');}
 finally{await pool.end();}
}
main().catch(()=>{console.error('Миграция не завершена: проверьте подключение Neon и права записи. Значения подключения не выведены.');process.exitCode=1;});
