import {z} from 'zod';
import {field,validateFields} from './contracts';
export const rulesInput=z.object({output:z.unknown(),fields:z.array(field).min(1).max(8),requiredValues:z.record(z.string(),z.array(z.union([z.string(),z.number(),z.boolean()]))).optional()}).strict();
export function validateRules(input:z.infer<typeof rulesInput>){
 const violations:string[]=[];let normalizedOutput:Record<string,unknown>={};
 try{normalizedOutput=validateFields(input.output,input.fields);}catch{violations.push('Структура или типы полей не соответствуют контракту');}
 for(const [name,values] of Object.entries(input.requiredValues||{}))if(!values.includes(normalizedOutput[name] as any))violations.push(`Поле ${name} содержит недопустимое значение`);
 return {valid:violations.length===0,violations,normalizedOutput,componentId:'rules-validation',version:'3.0.0'};
}
