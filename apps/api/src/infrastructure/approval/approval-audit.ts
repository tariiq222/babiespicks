import {
  ApprovalAuditAction,
  ApprovalAuditActorType,
  ApprovalAuditEntityType,
  type Prisma,
} from '@prisma/client';

export const SERVER_DERIVED_APPROVAL_ACTOR_TYPE =
  ApprovalAuditActorType.ADMIN_API_KEY;
export const SERVER_DERIVED_APPROVAL_ACTOR_ID = 'admin-api-key' as const;

interface ApprovalAuditInput {
  action: ApprovalAuditAction;
  entityType: ApprovalAuditEntityType;
  entityId: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

interface ApprovalAuditDelegatePrisma {
  approvalAuditEvent: {
    create(args: {
      data: {
        actorType: typeof SERVER_DERIVED_APPROVAL_ACTOR_TYPE;
        actorId: typeof SERVER_DERIVED_APPROVAL_ACTOR_ID;
        action: ApprovalAuditAction;
        entityType: ApprovalAuditEntityType;
        entityId: string;
        reason?: string | null;
        metadata: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
}

/** Records an append-only approval decision using the server-derived admin API key actor. */
export async function recordApprovalAuditEvent(
  prisma: ApprovalAuditDelegatePrisma,
  input: ApprovalAuditInput,
): Promise<void> {
  await prisma.approvalAuditEvent.create({
    data: {
      actorType: SERVER_DERIVED_APPROVAL_ACTOR_TYPE,
      actorId: SERVER_DERIVED_APPROVAL_ACTOR_ID,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    },
  });
}
