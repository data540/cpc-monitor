import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AuctionInsightsClient } from '@/components/dashboard/AuctionInsightsClient'

export default async function AuctionInsightsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <AuctionInsightsClient user={session.user as any} />
}
