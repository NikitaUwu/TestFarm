import raw from './policy.json';
export function configuration(){return structuredClone(raw);}
export type Configuration=ReturnType<typeof configuration>;
export function required(name:string){const value=process.env[name];if(!value)throw new Error(`${name} не настроен`);return value;}
export function origin(){return process.env.APP_ORIGIN||(process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:'http://localhost:3000');}
export function internalHeaders(){return {'Content-Type':'application/json','X-Farm-Service':required('INTERNAL_API_TOKEN'),...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{})};}
