import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/adwords',
          ].join(' '),
          access_type: 'offline',
          prompt:      'consent',
        },
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      return url.startsWith(baseUrl) ? url : baseUrl + '/dashboard'
    },
    async signIn({ user, account }) {
      // Actualizar tokens en BD en cada login — el PrismaAdapter no lo hace automáticamente
      if (account && user?.id && account.access_token) {
        try {
          await prisma.account.updateMany({
            where: { userId: user.id, provider: account.provider },
            data: {
              access_token:  account.access_token,
              expires_at:    account.expires_at ?? null,
              ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
            },
          })
        } catch {
          // Si falla la actualización, el login sigue adelante igualmente
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) token.id = user.id
      if (account) {
        token.accessToken  = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt    = account.expires_at
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'jwt',
  },
}
