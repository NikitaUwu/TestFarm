/** One-way import: legacy DB is read-only; IDs and password hashes are preserved. */
import {loadEnvConfig} from '@next/env';
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

async function main(){
 loadEnvConfig(process.cwd());
 const snapshot=process.env.LEGACY_DATABASE_URL?null:JSON.parse(readFileSync(resolve(process.cwd(),'../.local/legacy-export.json'),'utf8'));
 const source=snapshot?null:new Pool({connectionString:process.env.LEGACY_DATABASE_URL,max:1});
 const destination=new Pool({connectionString:process.env.NEON_BASE||process.env.DATABASE_URL,max:1});
 const old=source?await source.connect():{release(){},async query(query:string,args:any[]=[]):Promise<{rows:any[]}>{
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(query))return {rows:[]};
  if(query.includes('information_schema.columns'))return {rows:Object.entries(snapshot).flatMap(([table_name,rows]:[string,any])=>Object.keys(rows[0]||{}).map(column_name=>({table_name,column_name})))};
  const table=query.match(/FROM "?([a-z_]+)"?/i)?.[1];if(!table)throw new Error('Unsupported snapshot query');
  let rows=[...(snapshot[table]||[])];const column=query.match(/WHERE "?([a-z_]+)"?=/i)?.[1];
  if(column)rows=rows.filter(row=>Array.isArray(args[0])?args[0].includes(row[column]):row[column]===args[0]);
  if(query.includes('ORDER BY version'))rows.sort((a,b)=>a.version-b.version);return {rows};
 }},fresh=await destination.connect();
 try{
  await old.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await fresh.query('BEGIN');
  await fresh.query('SELECT pg_advisory_xact_lock(920260911)');
  const accounts=(await old.query('SELECT * FROM accounts')).rows;
  for(const account of accounts)await fresh.query('INSERT INTO farm_accounts(id,username,email,password_hash,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[account.principal_id,account.username,account.email,account.password_hash,account.created_at]);
  const ideas=(await old.query('SELECT * FROM ideas')).rows;
  // Discover the legacy business tables without exporting authentication or integration secrets.
  const tables=(await old.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name IN ('idea_id','run_id','dataset_id','experiment_id','observation_id','calculation_id','build_id','version_id') OR table_name='research_runs')")).rows;
  const definitions=new Map<string,Set<string>>();for(const row of tables){if(!/^[a-z_]+$/.test(row.table_name)||row.table_name.startsWith('farm_'))continue;if(!definitions.has(row.table_name))definitions.set(row.table_name,new Set());definitions.get(row.table_name)!.add(row.column_name);}
  for(const idea of ideas){
   const versions=(await old.query('SELECT * FROM idea_versions WHERE idea_id=$1 ORDER BY version',[idea.id])).rows;
   const current=versions.find(v=>v.version===idea.current_version);
   await fresh.query('INSERT INTO farm_ideas(id,owner_id,title,version,priority,stage,content,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING',[idea.id,idea.owner_id,idea.title,idea.current_version,idea.priority,idea.stage==='archived'?'archived':'draft',current?.content||{},idea.created_at,idea.updated_at]);
   for(const version of versions)await fresh.query('INSERT INTO farm_idea_versions(id,idea_id,version,content,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[version.id,idea.id,version.version,version.content,version.created_at]);
   const archive:Record<string,any[]>={ideas:[idea],idea_versions:versions};
   const selectors:Record<string,string>={run_id:'research_runs',dataset_id:'datasets',experiment_id:'experiment_runs',observation_id:'task_observations',calculation_id:'calculation_runs',build_id:'mvp_builds',version_id:'mvp_versions'};
   const pending=new Map(definitions);pending.delete('idea_versions');
   for(let pass=0;pass<8&&pending.size;pass++)for(const [table,columns] of pending){
    if(columns.has('idea_id')){archive[table]=(await old.query(`SELECT * FROM "${table}" WHERE idea_id=$1`,[idea.id])).rows;pending.delete(table);continue;}
    const selector=Object.entries(selectors).find(([column,parent])=>columns.has(column)&&archive[parent]);
    if(selector){const [column,parent]=selector;archive[table]=(await old.query(`SELECT * FROM "${table}" WHERE "${column}"=ANY($1::uuid[])`,[archive[parent].map(row=>row.id)])).rows;pending.delete(table);}
   }
   await fresh.query('INSERT INTO farm_legacy_archives(idea_id,content) VALUES($1,$2) ON CONFLICT(idea_id) DO NOTHING',[idea.id,JSON.stringify({importedAt:new Date().toISOString(),formatVersion:1,tables:archive})]);
  }
  await fresh.query('COMMIT');await old.query('COMMIT');
  console.log(`Импорт завершён: аккаунтов ${accounts.length}, идей ${ideas.length}. Старый контур не изменён.`);
 }catch(error){await fresh.query('ROLLBACK');await old.query('ROLLBACK');throw error;}
 finally{old.release();fresh.release();await source?.end();await destination.end();}
}
main().catch(()=>{console.error('Импорт остановлен и транзакция отменена. Проверьте подключение и отсутствие конфликтов логинов. Секреты не выведены.');process.exitCode=1;});
