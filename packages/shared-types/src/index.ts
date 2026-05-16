// Shared types between frontend and backend
// Will be populated as features are built

export type Locale = 'ar' | 'en';

export type VerdictType = 'WORTH_IT' | 'WORTH_IT_WITH' | 'WAIT' | 'NOT_WORTH_IT';

export type CouponStatus = 'ACTIVE' | 'EXPIRED' | 'NEEDS_REVIEW';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
