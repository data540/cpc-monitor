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
    async signIn({ user, account }) {
      // Persistir tokens en BD — el PrismaAdapter no los actualiza en logins sucesivos
      if (account && user?.id && account.access_token) {
        try {
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider:          account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            update: {
              access_token: account.access_token,
              expires_at:   account.expires_at ?? null,
              ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
            },
            create: {
              userId:            user.id,
              type:              account.type,
              provider:          account.provider,
              providerAccountId: account.providerAccountId,
              access_token:      account.access_token,
              refresh_token:     account.refresh_token ?? null,
              expires_at:        account.expires_at ?? null,
              token_type:        account.token_type ?? null,
              scope:             account.scope ?? null,
              id_token:          account.id_token ?? null,
            },
          })
        } catch {
          // El login continúa aunque falle el upsert
        }
      }
      return true
    },
    async redirect({ url, baseUrl }) {
      return url.startsWith(baseUrl) ? url : baseUrl + '/dashboard'
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
