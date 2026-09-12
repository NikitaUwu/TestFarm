import {loadEnvConfig} from '@next/env';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
async function main(){
 loadEnvConfig(process.cwd());
 const deploymentId=process.argv[2],url=process.argv[3];
 if(!deploymentId?.startsWith('dpl_')||!url?.startsWith('https://'))throw new Error('Release metadata required');
 const pool=new Pool({connectionString:process.env.NEON_BASE||process.env.DATABASE_URL,max:1});const client=await pool.connect();
 try{const id=randomUUID();await client.query('BEGIN');await client.query("INSERT INTO farm_execution_log(id,actor_type,actor_name,action,provider,status,finished_at,input_ref,output_ref) VALUES($1,'agent','codex','production_deployment','vercel','completed',now(),$2,$3)",[id,`execution:${id}:input`,`execution:${id}:output`]);await client.query('INSERT INTO farm_action_data(id,content) VALUES($1,$2)',[id,JSON.stringify({input:{actor:'user-authorized agent',service:'Vercel',reason:'Deployment requested by user',allowed_exception:'One-time authentication and project configuration',tools:['Vercel CLI','Git','terminal'],release:'v1.3',provider:'RouterAI',researchBudgetRub:20,models:['qwen/qwen3.5-9b','openai/gpt-oss-120b','openai/whisper-large-v3-turbo'],legacyImport:'excluded by user',tests:'not run at user request'},output:{deploymentId,url,status:'READY'}})]);await client.query('COMMIT');console.log('Публикация записана в журнал действий.');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
main().catch(()=>{console.error('Не удалось записать событие публикации. Секреты не выведены.');process.exitCode=1;});
