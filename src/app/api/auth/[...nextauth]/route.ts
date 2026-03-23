import NextAuth, { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Scope de Google Ads API — readonly para monitorización
          // Cambia a 'https://www.googleapis.com/auth/adwords' para ajuste automático
          scope: [
            'openid',
            'email',
            'profile',
          ].join(' '),
          access_type:   'offline',   // necesario para refresh_token
          prompt:        'consent',   // fuerza pantalla de consentimiento con scopes
        },
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      return url.startsWith(baseUrl) ? url : baseUrl + '/dashboard'
    },
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'database',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
