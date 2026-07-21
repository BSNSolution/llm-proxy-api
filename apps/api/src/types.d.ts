import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuário autenticado (preenchido pelo preHandler de /api/*). */
    authUser: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      sessionId: string;
    } | null;
  }
}
