import {put,get,del} from '@vercel/blob';
import {eq} from 'drizzle-orm';
import {db} from './db';
import {artifacts} from './schema';
import {configuration,required} from './config';
export async function storeAudio(ownerId:string,file:File){
 required('BLOB_READ_WRITE_TOKEN');const config=configuration();
 if(file.size>config.budget.audioBytes)throw new Error('Запись превышает 4 МБ');
 if(!['audio/webm','audio/wav','audio/x-wav','audio/mp4','audio/mpeg'].includes(file.type))throw new Error('Недопустимый формат аудио');
 const id=crypto.randomUUID(),path=`${ownerId}/audio/${id}`;const blob=await put(path,file,{access:'private',addRandomSuffix:false,contentType:file.type});
 try{await db().insert(artifacts).values({id,ownerId,pathname:blob.pathname,kind:'audio',mime:file.type,size:file.size});}catch(error){await del(blob.pathname);throw error;}
 return id;
}
export async function readAudio(id:string,ownerId:string){const [a]=await db().select().from(artifacts).where(eq(artifacts.id,id));if(!a||a.ownerId!==ownerId)throw new Error('Аудио недоступно');const blob=await get(a.pathname,{access:'private'});if(!blob||blob.statusCode!==200)throw new Error('Файл недоступен');return new Blob([await new Response(blob.stream).arrayBuffer()],{type:a.mime});}
export async function storeJson(ownerId:string,ideaId:string,id:string,kind:string,value:unknown){
 const [existing]=await db().select().from(artifacts).where(eq(artifacts.id,id));if(existing)return existing.id;
 const body=JSON.stringify(value),pathname=`${ownerId}/${ideaId}/${kind}/${id}.json`;
 await put(pathname,body,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 await db().insert(artifacts).values({id,ownerId,ideaId,pathname,kind,mime:'application/json',size:Buffer.byteLength(body)}).onConflictDoNothing();return id;
}
