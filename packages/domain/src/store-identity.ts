import type {Prisma} from '@babiespicks/db';

/** Store identity edits and listing creation share this transaction row lock.
 * Read after locking so a waiting writer validates the committed identity. */
export async function readLockedStore(tx:Prisma.TransactionClient,id:string){
 await tx.$queryRaw`SELECT "id" FROM "stores" WHERE "id" = ${id} FOR UPDATE`;
 return tx.store.findUnique({where:{id}});
}
