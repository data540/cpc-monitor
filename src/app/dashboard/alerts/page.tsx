import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AlertsClient } from '@/components/dashboard/AlertsClient'

export default async function AlertsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <AlertsClient user={session.user as any} />
}
