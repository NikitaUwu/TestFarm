import {loadEnvConfig} from '@next/env';
import {Pool} from 'pg';
import {put} from '@vercel/blob';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const readObject=`import os,sys,boto3
s=boto3.client('s3',endpoint_url=os.environ['S3_ENDPOINT'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'])
r=s.get_object(Bucket=os.environ.get('S3_BUCKET','farm'),Key=sys.argv[1])
while True:
 b=r['Body'].read(65536)
 if not b:break
 sys.stdout.buffer.write(b)
`;
async function main(){
 loadEnvConfig(process.cwd());
 const snapshot=JSON.parse(readFileSync(resolve(process.cwd(),'../.local/legacy-export.json'),'utf8'));
 const pool=new Pool({connectionString:process.env.NEON_BASE||process.env.DATABASE_URL,max:1});let copied=0;
 try{
  for(const artifact of snapshot.artifacts||[]){
   if((await pool.query('SELECT id FROM farm_artifacts WHERE id=$1',[artifact.id])).rowCount)continue;
   const idea=snapshot.ideas.find((row:any)=>row.id===artifact.idea_id);if(!idea)throw new Error('Missing owner');
   const body=execFileSync('docker',['compose','exec','-T','api','python','-c',readObject,artifact.object_key],{cwd:resolve(process.cwd(),'..'),maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
   const pathname=`${idea.owner_id}/${idea.id}/legacy/${artifact.id}`;
   await put(pathname,body,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:artifact.mime});
   await pool.query('INSERT INTO farm_artifacts(id,owner_id,idea_id,pathname,kind,mime,size,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING',[artifact.id,idea.owner_id,idea.id,pathname,artifact.kind,artifact.mime,body.length,artifact.created_at]);copied++;
  }
  console.log(`Исторические файлы перенесены в Private Blob: ${copied}. Исходники сохранены.`);
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Перенос файлов остановлен; успешно сохранённые файлы будут пропущены при продолжении. Старое хранилище не изменено.');process.exitCode=1;});
