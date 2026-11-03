import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { executeTool } from './index';
const editor={id:'editor',canPublish:false};
const metadata={id:'p',version:4,publishStatus:'PUBLISHED'};
function database(section:string,value:unknown,locale?:string){
  return {product:{findUnique:async(query:any)=>{
    expect(query.where).toEqual({id:'p'});
    const selected=section==='translation'?{translations:{where:{locale},select:{locale:true,name:true,description:true,slug:true,metaTitle:true,metaDescription:true}}}:{[section]:true};
    expect(query.select).toEqual({id:true,version:true,publishStatus:true,...selected});
    return {...metadata,...(section==='translation'?{translations:value}:{[section]:value})};
  }}} as never;
}
describe('bounded product section reader',()=>{
  it('reconstructs complete stored sources in bounded chunks with stable hash and no body/receipt/write reads',async()=>{
    const sources=[{url:'https://example.com',field:'verdict',note:'م'.repeat(8000)}];
    const db=database('sources',sources);let chunked='';let offset=0;let sha256:string|undefined;
    do {
      const result=await executeTool('bp_get_product_section',{id:'p',section:'sources',offset,limit:3000,...(offset?{expectedVersion:4,expectedHash:sha256}:{})},editor,db);
      expect(result).toMatchObject({...metadata,section:'sources',offset,totalCharacters:JSON.stringify(sources).length});
      expect(result.chunk.length).toBeLessThanOrEqual(3000);sha256=result.sha256;chunked+=result.chunk;offset=result.nextOffset;
    }while(offset!==null);
    expect(JSON.parse(chunked)).toEqual(sources);
    expect(sha256).toBe(createHash('sha256').update(JSON.stringify(sources)).digest('hex'));
  });
  it('reconstructs Arabic and emoji in one-code-point chunks without corrupting independent UTF-8 encoding',async()=>{
    const sources=[{note:'مرحبا 🧸👶🏽'}];
    const serialized=JSON.stringify(sources);
    const db=database('sources',sources);
    const chunks:string[]=[];
    let offset:number|null=0;let hash:string|undefined;
    while(offset!==null){
      const result=await executeTool('bp_get_product_section',{id:'p',section:'sources',offset,limit:1,...(offset?{expectedVersion:4,expectedHash:hash}:{})},editor,db);
      expect(Array.from(result.chunk)).toHaveLength(1);
      expect(result.offset).toBe(chunks.length);
      expect(result.nextOffset).toBe(chunks.length+1<Array.from(serialized).length?chunks.length+1:null);
      expect(result.totalCharacters).toBe(Array.from(serialized).length);
      chunks.push(result.chunk);offset=result.nextOffset;hash=result.sha256;
    }
    expect(chunks.join('')).toBe(serialized);
    // Each independently encoded chunk must retain the original UTF-8 bytes.
    expect(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk,'utf8')))).toEqual(Buffer.from(serialized,'utf8'));
    expect(hash).toBe(createHash('sha256').update(serialized,'utf8').digest('hex'));
  });
  it('applies the default bound and detects changed section bytes during continuation even at the same version',async()=>{
    const original=[{note:'A'.repeat(7000)}];
    const first=await executeTool('bp_get_product_section',{id:'p',section:'sources'},editor,database('sources',original));
    expect(first.chunk.length).toBe(3000);expect(first.nextOffset).toBe(3000);
    const max=await executeTool('bp_get_product_section',{id:'p',section:'sources',limit:6000},editor,database('sources',original));
    expect(max.chunk.length).toBe(6000);
    await expect(executeTool('bp_get_product_section',{id:'p',section:'sources',offset:first.nextOffset,expectedVersion:first.version,expectedHash:first.sha256},editor,database('sources',[{note:'B'.repeat(7000)}]))).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('selects only one requested translation locale and serializes a complete edit object',async()=>{
    const translation={locale:'ar',name:'اسم',description:'وصف',slug:'arabic-name',metaTitle:null,metaDescription:null};
    const result=await executeTool('bp_get_product_section',{id:'p',section:'translation',locale:'ar'},editor,database('translation',[translation],'ar'));
    expect(result).toMatchObject({locale:'ar',nextOffset:null,chunk:JSON.stringify(translation)});
  });
  it('reads null verdicts and absent translations without loading unrelated sections',async()=>{
    expect(await executeTool('bp_get_product_section',{id:'p',section:'verdict'},editor,database('verdict',null))).toMatchObject({chunk:'null',totalCharacters:4,nextOffset:null});
    expect(await executeTool('bp_get_product_section',{id:'p',section:'translation',locale:'en'},editor,database('translation',[],'en'))).toMatchObject({chunk:'null'});
  });
  it('rejects stale version/hash, unguarded continuation and offsets beyond serialized data',async()=>{
    for(const args of [{expectedVersion:3},{expectedHash:'0'.repeat(64)},{offset:1},{offset:20,expectedVersion:4,expectedHash:createHash('sha256').update('null').digest('hex')}])await expect(executeTool('bp_get_product_section',{id:'p',section:'verdict',...args},editor,database('verdict',null))).rejects.toMatchObject({code:args.expectedVersion===3||args.expectedHash==='0'.repeat(64)?'VERSION_CONFLICT':'INVALID_INPUT'});
  });
  it('validates limits, locale applicability, guards and authenticated reads',async()=>{
    for(const args of [{limit:6001},{offset:-1},{expectedHash:'x'},{locale:'ar'},{section:'translation'},{section:'sources',actor:{canPublish:true}}])await expect(executeTool('bp_get_product_section',{id:'p',section:'verdict',...args},editor,{} as never)).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(executeTool('bp_get_product_section',{id:'p',section:'sources'},{id:'',canPublish:false},{} as never)).rejects.toMatchObject({code:'UNAUTHORIZED'});
    await expect(executeTool('bp_get_product_section',{id:'missing',section:'sources'},editor,{product:{findUnique:async()=>null}} as never)).rejects.toMatchObject({code:'NOT_FOUND'});
  });
});
