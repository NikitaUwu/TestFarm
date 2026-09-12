import {loadEnvConfig} from '@next/env';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
loadEnvConfig(process.cwd());
const values:Record<string,string|undefined>={
 NEON_BASE:process.env.NEON_BASE||process.env.DATABASE_URL,
 BLOB_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN,
 ROUTERAI_API_KEY:process.env.ROUTERAI_API_KEY,
 INTERNAL_API_TOKEN:process.env.INTERNAL_API_TOKEN,
 APP_ORIGIN:process.env.APP_ORIGIN,
};
for(const [name,value] of Object.entries(values)){
 if(!value){console.error(`${name}: отсутствует локальное значение`);process.exitCode=1;break;}
 const child=spawnSync('cmd.exe',['/d','/s','/c',`npx.cmd --yes vercel@59.11.7 env add ${name} production,preview --force --yes ${name==='APP_ORIGIN'?'--no-sensitive':'--sensitive'}`],{cwd:resolve(process.cwd(),'..'),input:value,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000});
 if(child.status!==0){console.error(`${name}: запись в Vercel не завершена. Содержимое ответа скрыто.`);process.exitCode=1;break;}
 console.log(`${name}: сохранено в Vercel`);
}
