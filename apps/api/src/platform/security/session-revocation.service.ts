import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type RevokedCacheEntry = { expiresAt: number };

const DENY_CACHE_TTL_MS = 5_000;
const MAX_DENY_CACHE_ENTRIES = 10_000;

@Injectable()
export class SessionRevocationService {
  private readonly revoked = new Map<string, RevokedCacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async assertActive(sessionId: string, userId: string) {
    const now = Date.now();
    const cached = this.revoked.get(sessionId);
    if (cached) {
      if (cached.expiresAt > now) throw new UnauthorizedException("Authentication session is revoked or expired");
      this.revoked.delete(sessionId);
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, status: true, expiresAt: true },
    });
    if (!session || session.userId !== userId || session.status !== "ACTIVE" || session.expiresAt.getTime() <= now) {
      this.rememberRevoked(sessionId, now);
      throw new UnauthorizedException("Authentication session is revoked or expired");
    }
  }

  invalidate(sessionId: string) {
    this.rememberRevoked(sessionId, Date.now());
  }

  private rememberRevoked(sessionId: string, now: number) {
    if (this.revoked.size >= MAX_DENY_CACHE_ENTRIES && !this.revoked.has(sessionId)) {
      const oldest = this.revoked.keys().next().value;
      if (oldest) this.revoked.delete(oldest);
    }
    this.revoked.set(sessionId, { expiresAt: now + DENY_CACHE_TTL_MS });
  }
}
