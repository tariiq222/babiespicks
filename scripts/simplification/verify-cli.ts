import { readFile,writeFile } from 'node:fs/promises';
import { prisma } from '@babiespicks/db';
import { captureInventory,verifyMigration } from './verify-migration';
const [mode,file]=process.argv.slice(2);
try{
 if(!file||!['capture','verify'].includes(mode))throw new Error('Usage: verify-migration <capture|verify> <inventory.json>');
 if(mode==='capture'){await writeFile(file,JSON.stringify(await captureInventory(prisma,process.argv.includes('--legacy')?'legacy':'canonical'),null,2),{mode:0o600});console.log('Inventory saved; contains identifiers but no content or credentials')}
 else {const result=await verifyMigration(prisma,JSON.parse(await readFile(file,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1}
}catch(error){console.error(error instanceof Error?error.message:'Verification failed');process.exitCode=1}
finally{await prisma.$disconnect()}
