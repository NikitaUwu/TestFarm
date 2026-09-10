import { NextRequest } from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const base=process.env.API_URL || 'http://127.0.0.1:8000';
  const url=base+'/'+path.map(encodeURIComponent).join('/')+request.nextUrl.search;
  const headers=new Headers();
  for(const name of ['content-type','cookie','x-farm-request']){const value=request.headers.get(name);if(value) headers.set(name,value);}
  try{
    const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
    if(body && body.byteLength>22*1024*1024) return Response.json({detail:'Файл слишком большой'},{status:413});
    const response=await fetch(url,{method:request.method,headers,body,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(180000)});
    const out=new Headers();
    for(const name of ['content-type','set-cookie','content-disposition']){const value=response.headers.get(name);if(value) out.set(name,value);}
    out.set('cache-control','no-store');out.set('x-content-type-options','nosniff');
    return new Response(response.body,{status:response.status,headers:out});
  }catch{return Response.json({detail:'Сервер недоступен. Проверьте запуск API и PostgreSQL.'},{status:503});}
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as DELETE};
