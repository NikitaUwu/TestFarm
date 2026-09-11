import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
// The snapshot contains password hashes. Keep it local and never print its contents.
const code=`import json, os, psycopg
from psycopg.rows import dict_row
from psycopg import sql
with psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row) as c:
 c.execute('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 names=c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").fetchall()
 excluded={'sessions','principals','integrations','configurations','login_attempts','alembic_version','schema_migrations'}
 data={}
 for row in names:
  name=row['table_name']
  if name in excluded or name.startswith('farm_'): continue
  columns=c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s",(name,)).fetchall()
  relevant=any(x['column_name'] in ('idea_id','run_id','dataset_id','experiment_id','observation_id','calculation_id','build_id','version_id') for x in columns)
  if relevant or name in ('accounts','ideas'):
   data[name]=c.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(name))).fetchall()
 print(json.dumps(data,default=str))
`;
try{
 const snapshot=execFileSync('docker',['compose','exec','-T','api','python','-c',code],{cwd:resolve(process.cwd(),'..'),maxBuffer:100*1024*1024,stdio:['ignore','pipe','pipe']});
 JSON.parse(snapshot.toString('utf8'));
 const directory=resolve(process.cwd(),'../.local');mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'legacy-export.json'),snapshot);
 console.log('Исторический снимок сохранён в .local/legacy-export.json. Содержимое не выведено.');
}catch{console.error('Экспорт не завершён. Старые данные не изменены.');process.exitCode=1;}
