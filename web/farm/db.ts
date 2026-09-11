import {Pool as NeonPool,neonConfig} from '@neondatabase/serverless';
import {drizzle as neonDrizzle} from 'drizzle-orm/neon-serverless';
import {Pool} from 'pg';
import {drizzle,NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from './schema';
let database:NodePgDatabase<typeof schema>|undefined;
export function db(){
  if(database)return database;
  const connectionString=process.env.NEON_BASE||process.env.DATABASE_URL;
  if(!connectionString)throw new Error('NEON_BASE не настроен: подключите Neon');
  if(process.env.DB_DRIVER==='local'){
    if(process.env.VERCEL)throw new Error('Локальный драйвер запрещён в облаке');
    database=drizzle(new Pool({connectionString,max:4}),{schema});
  }else{
    neonConfig.webSocketConstructor=WebSocket;
    database=neonDrizzle(new NeonPool({connectionString,max:4}),{schema}) as unknown as NodePgDatabase<typeof schema>;
  }
  return database;
}
