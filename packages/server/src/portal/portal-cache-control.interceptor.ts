import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { tap } from "rxjs";
import type { AuthorizedRequest } from "../authorization/authorization.decorator.js";

/**
 * Portal 公开读端点缓存策略：
 * - 匿名响应：列表/首页/详情可公开缓存（max-age=300）；docs、评论、apps-hunt 时效敏感不缓存。
 * - 已登录响应：含个性化字段（isFavorited/hasVoted 等），禁止公开缓存（private, no-cache）。
 * - 所有响应统一 Vary: Cookie，防止 CDN/浏览器把个性化响应缓存后发给匿名用户。
 */
@Injectable()
export class PortalCacheControlInterceptor implements NestInterceptor {
  public static readonly ANONYMOUS_MAX_AGE_SECONDS = 300;

  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      tap(() => {
        const request = context
          .switchToHttp()
          .getRequest<AuthorizedRequest & { url?: string }>();
        const response = context.switchToHttp().getResponse<{
          setHeader(name: string, value: string): unknown;
        }>();
        response.setHeader("Vary", "Cookie");
        if (request.actor !== undefined) {
          response.setHeader("Cache-Control", "private, no-cache");
          return;
        }
        const path = request.url ?? "";
        const noCache = /\/docs\/|\/comments|\/apps-hunt/u.test(path);
        response.setHeader(
          "Cache-Control",
          noCache
            ? "no-cache"
            : `public, max-age=${PortalCacheControlInterceptor.ANONYMOUS_MAX_AGE_SECONDS}`,
        );
      }),
    );
  }
}
