import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {and,eq,gt,or,sql} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {accounts,sessions,rateLimits} from './schema';
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16);return `scrypt-v1$${salt.toString('hex')}$${(await derive(password,salt)).toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string){const [version,salt,digest]=encoded.split('$');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(digest))return false;return timingSafeEqual(await derive(password,Buffer.from(salt,'hex')),Buffer.from(digest,'hex'));}
export const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export function mutation(request:NextRequest){if(request.headers.get('X-Farm-Request')!=='1')throw new ApiError(403,'Недопустимый запрос');const source=request.headers.get('origin');if(source&&source!==request.nextUrl.origin)throw new ApiError(403,'Недопустимый источник запроса');}
export async function rate(key:string,limit:number,seconds=600){const slot=Math.floor(Date.now()/1000/seconds);const [r]=await db().insert(rateLimits).values({key:sha(key),slot,count:1}).onConflictDoUpdate({target:[rateLimits.key,rateLimits.slot],set:{count:sql`${rateLimits.count}+1`}}).returning();if(r.count>limit)throw new ApiError(429,'Слишком много запросов. Повторите позже.');}
export async function actor(request:NextRequest){const token=request.cookies.get('farm_session')?.value;if(!token)throw new ApiError(401,'Войдите в аккаунт');const [row]=await db().select({id:accounts.id,username:accounts.username,email:accounts.email}).from(sessions).innerJoin(accounts,eq(accounts.id,sessions.accountId)).where(and(eq(sessions.hash,sha(token)),gt(sessions.expiresAt,new Date())));if(!row)throw new ApiError(401,'Сессия завершена');return row;}
async function loginResponse(account:{id:string;username:string;email:string|null},status=200){const token=randomBytes(32).toString('hex');await db().insert(sessions).values({hash:sha(token),accountId:account.id,expiresAt:new Date(Date.now()+7*86400000)});const response=NextResponse.json(account,{status});response.cookies.set('farm_session',token,{httpOnly:true,secure:!!process.env.VERCEL,sameSite:'strict',path:'/',maxAge:7*86400});return response;}
export async function authRoute(request:NextRequest,action:string){
 if(action==='me'&&request.method==='GET')return NextResponse.json(await actor(request));
 if(request.method!=='POST')throw new ApiError(405,'Метод не поддерживается');
 mutation(request);const remote=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';await rate('auth:'+remote,30);
 if(action==='logout'){const token=request.cookies.get('farm_session')?.value;if(token)await db().delete(sessions).where(eq(sessions.hash,sha(token)));const response=NextResponse.json({ok:true});response.cookies.set('farm_session','',{path:'/',maxAge:0});return response;}
 const body=await request.json();
 if(action==='register'){
  const value=z.object({username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/),email:z.email().max(254).transform(v=>v.trim().toLowerCase()),password:z.string().min(12).max(200)}).strict().parse(body);
  await rate('register:'+remote,5,3600);const id=crypto.randomUUID();
  try{await db().insert(accounts).values({id,username:value.username,email:value.email,passwordHash:await hashPassword(value.password)});}catch(error:any){if(error?.cause?.code==='23505'||error?.code==='23505')throw new ApiError(409,'Логин или почта уже используются');throw error;}
  return loginResponse({id,username:value.username,email:value.email},201);
 }
 if(action==='login'){
  const value=z.object({identifier:z.string().trim().toLowerCase().min(1).max(254),password:z.string().max(200)}).strict().parse(body);await rate('login:'+remote+':'+value.identifier,10);
  const [account]=await db().select().from(accounts).where(or(eq(accounts.username,value.identifier),eq(accounts.email,value.identifier)));
  const hash=account?.passwordHash||'scrypt-v1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid=await verifyPassword(value.password,hash);if(!account||!valid)throw new ApiError(401,'Неверный логин, почта или пароль');return loginResponse({id:account.id,username:account.username,email:account.email});
 }
 throw new ApiError(404,'Не найдено');
}
