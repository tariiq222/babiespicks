export interface ChatTextTurn {role:'user'|'assistant';content:string}

/** Stored cards are observations from an old turn, never current offers after reload. */
export function restoreChatText(serialized:string|null):ChatTextTurn[]{
 try{
  const value:unknown=JSON.parse(serialized??'null');
  if(!Array.isArray(value))return [];
  return value.slice(-40).flatMap((entry:unknown)=>{
   if(!entry||typeof entry!=='object')return [];
   const {role,content}=entry as Record<string,unknown>;
   if((role!=='user'&&role!=='assistant')||typeof content!=='string')return [];
   const text=content.trim();
   return text&&text.length<=(role==='user'?500:2000)?[{role,content:text}]:[];
  });
 }catch{return [];}
}
