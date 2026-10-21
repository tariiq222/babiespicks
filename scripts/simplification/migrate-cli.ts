import { prisma } from '@babiespicks/db';
import { migrateLegacy } from './migrate';
const args=process.argv.slice(2);
try{
 const apply=args.includes('--apply');
 if(apply){
  const dbName=new URL(process.env.DATABASE_URL??'').pathname.slice(1);
  const expected=args.find(a=>a.startsWith('--database-name='))?.split('=').slice(1).join('=');
  if(!args.includes('--confirm-writers-stopped')||!expected||expected!==dbName)throw new Error('Apply requires --confirm-writers-stopped and --database-name=<exact database name>. Dry-run first and verify a restorable backup.');
 }
 console.log(JSON.stringify(await migrateLegacy(prisma,{apply}),null,2));
}catch(error){console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1}
finally{await prisma.$disconnect()}
