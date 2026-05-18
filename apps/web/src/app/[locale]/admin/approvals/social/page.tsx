'use client';

import { redirect } from 'next/navigation';

export default function SocialApprovalsRedirect() {
  redirect('/admin/approvals');
}
