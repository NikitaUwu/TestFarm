import {put,get,del} from '@vercel/blob';
import {eq} from 'drizzle-orm';
import {db} from './db';
import {artifacts} from './schema';
import {configuration,required} from './config';
import {ApiError} from './auth';

const ALLOWED_MIME_TYPES = [
 'audio/webm',
 'audio/wav',
 'audio/x-wav',
 'audio/wave',
 'audio/mp4',
 'audio/mpeg',
 'audio/mp3',
 'audio/ogg',
 'audio/x-m4a',
 'audio/m4a',
 'audio/aac',
];

export function normalizeAudioMime(rawType: string, filename = ''): string {
 const baseType = (rawType || '').split(';')[0].trim().toLowerCase();
 if (ALLOWED_MIME_TYPES.includes(baseType)) return baseType;

 const lowerName = filename.toLowerCase();
 if (lowerName.endsWith('.webm')) return 'audio/webm';
 if (lowerName.endsWith('.wav')) return 'audio/wav';
 if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
 if (lowerName.endsWith('.mp4') || lowerName.endsWith('.m4a')) return 'audio/mp4';
 if (lowerName.endsWith('.ogg')) return 'audio/ogg';

 if (baseType.startsWith('audio/')) return baseType;
 return 'audio/webm';
}

export async function storeAudio(ownerId:string,file:File){
 required('BLOB_READ_WRITE_TOKEN');const config=configuration();
 if(file.size>config.budget.audioBytes)throw new ApiError(413,'Запись превышает 4 МБ');
 const mime=normalizeAudioMime(file.type,file.name);
 if(!ALLOWED_MIME_TYPES.includes(mime))throw new ApiError(400,`Недопустимый формат аудио (${file.type || 'неизвестный'})`);
 const id=crypto.randomUUID(),path=`${ownerId}/audio/${id}`;
 const blob=await put(path,file,{access:'private',addRandomSuffix:false,contentType:mime});
 try{await db().insert(artifacts).values({id,ownerId,pathname:blob.pathname,kind:'audio',mime,size:file.size});}catch(error){await del(blob.pathname);throw error;}
 return id;
}
export async function readAudio(id:string,ownerId:string){const [a]=await db().select().from(artifacts).where(eq(artifacts.id,id));if(!a||a.ownerId!==ownerId)throw new Error('Аудио недоступно');const blob=await get(a.pathname,{access:'private'});if(!blob||blob.statusCode!==200)throw new Error('Файл недоступен');return new Blob([await new Response(blob.stream).arrayBuffer()],{type:a.mime});}
export async function storeJson(ownerId:string,ideaId:string,id:string,kind:string,value:unknown){
 const [existing]=await db().select().from(artifacts).where(eq(artifacts.id,id));if(existing)return existing.id;
 const body=JSON.stringify(value),pathname=`${ownerId}/${ideaId}/${kind}/${id}.json`;
 await put(pathname,body,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 await db().insert(artifacts).values({id,ownerId,ideaId,pathname,kind,mime:'application/json',size:Buffer.byteLength(body)}).onConflictDoNothing();return id;
}
