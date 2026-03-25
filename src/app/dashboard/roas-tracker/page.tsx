import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RoasTrackerClient } from '@/components/dashboard/RoasTrackerClient'

export default async function RoasTrackerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <RoasTrackerClient user={session.user as any} />
}
