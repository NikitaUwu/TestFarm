import {NextRequest} from 'next/server';
import {farmApi} from '../../../farm/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
async function handle(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){return farmApi(request,(await params).path);}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
