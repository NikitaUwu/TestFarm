export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);headers.set('X-Farm-Request','1');
  if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  const response=await fetch('/api'+path,{...options,headers,credentials:'same-origin',cache:'no-store'});
  const data=await response.json();
  if(!response.ok){const detail=typeof data.error==='string'?data.error:typeof data.detail==='string'?data.detail:JSON.stringify(data.detail || 'Ошибка запроса');throw new ApiError(detail,response.status);}
  return data;
}
export const post=(path:string,body:unknown={})=>api(path,{method:'POST',body:JSON.stringify(body)});
export type Idea={id:string;title:string;priority:number;stage:string;execution_state:string;current_version:number;updated_at:string;content:Content};
export type Content={title:string;transcript:string;problem:string;audience:string;value:string;current_process:string;expected_effect:string;knowledge:Record<string,string>;assumptions:string[];constraints:string[]};
export const blank:Content={title:'',transcript:'',problem:'',audience:'',value:'',current_process:'',expected_effect:'',knowledge:{},assumptions:[],constraints:[]};
export const stageNames:Record<string,string>={draft:'Черновик',queued:'В очереди',research:'Исследование',assessment:'Критическая оценка',decision:'Решение',mvp_building:'MVP в работе',mvp_ready:'MVP готов',archived:'Архив'};
export const stateNames:Record<string,string>={ready:'Готово к запуску',running:'Выполняется',waiting_for_user:'Ожидает решения',waiting_for_data:'Ожидает данных',paused:'Пауза',error:'Ошибка',completed:'Завершено',cancelled:'Отменено'};
export const priorityNames=['Низкий','Средний','Высокий'];
export const formatDate=(value:string)=>new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
