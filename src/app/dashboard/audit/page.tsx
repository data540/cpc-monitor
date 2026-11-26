import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AuditClient } from '@/components/dashboard/AuditClient'

export default async function AuditPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <AuditClient />
}
