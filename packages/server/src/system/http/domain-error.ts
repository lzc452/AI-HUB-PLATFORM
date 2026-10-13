/**
 * 领域错误码 → HTTP 语义的单一映射来源。
 *
 * **为什么需要它**：各controller 原本各自维护一份字符串匹配清单
 * （`if (code === "X_NOT_FOUND") ... else if (code === "Y_FORBIDDEN")`），
 * 已有 7 个 controller 各写一份。清单一多必然漂移——最典型的后果是
 * 新增的冲突类错误码漏进兜底分支，被降级成 400。
 *
 * 实际发生过：`DEMAND_CONFLICT`（乐观锁冲突，仓储里有 24 处抛出）
 * 因为没被任何 controller 登记，兜底成 `BadRequestException`，
 * 两个审核员并发操作时后提交者收到「参数错误」——
 * 而客户端只对 409 触发重试，所以它永远不会重试。
 *
 * 判定原则：**客户端拿到这个错误后，重新读取状态再重试是否有意义？**
 * - 有（并发冲突、状态机已迁移）→ 409 Conflict
 * - 没有（缺参数、格式错）→ 400 Bad Request
 */
import { ConflictException, HttpException } from "@nestjs/common";

/** 状态机已迁移到不允许当前操作的状态。 */
const INVALID_STATE_CODES: ReadonlySet<string> = new Set([
  "DEMAND_REVIEW_INVALID_STATE",
  "DEMAND_SUBMIT_INVALID_STATE",
  "DEMAND_CLAIM_INVALID_STATE",
  "DEMAND_CLAIM_PROPOSAL_INVALID_STATE",
  "DEMAND_RELEASE_INVALID_STATE",
  "DEMAND_PILOT_INVALID_STATE",
  "DEMAND_MERGE_INVALID_STATE",
  "DEMAND_APPLICATION_BRIDGE_INVALID_STATE",
]);

/** 乐观锁 / 唯一约束冲突：并发修改同一资源。 */
const CONFLICT_CODES: ReadonlySet<string> = new Set([
  "DEMAND_CONFLICT",
  "APPLICATION_STATE_CONFLICT",
  // 模型服务（0056 引入）：状态机非法迁移、同名未撤销 Key、活跃 Key 达上限。
  // 三者都是「重新读取状态后重试/换参数才有意义」，因此按冲突返回 409；
  // 未登记会被兜底成 400，客户端不会重试（本文件顶部记录的正是这个事故）。
  "MODEL_KEY_STATE_CONFLICT",
  "MODEL_KEY_NAME_DUPLICATED",
  "MODEL_KEY_LIMIT_REACHED",
]);

/**
 * 判断错误码是否为「并发冲突」，应当返回 409。
 *
 * 未知错误码返回 false（落入 400）——这是保守方向：
 * 把一个未登记的业务错误误判成 409 会让客户端白白重试，
 * 而降级成 400 至少不会造成重试风暴。
 */
export function isConflictCode(code: string): boolean {
  return CONFLICT_CODES.has(code) || INVALID_STATE_CODES.has(code);
}

/**
 * 领域错误码 → HttpException。
 *
 * 只处理**能明确判定语义**的码；其余错误码交回调用方的兜底分支，
 * 避免这里变成一个包揽一切的重试逻辑。
 */
export function toDomainHttpException(
  code: string,
  fallback: () => HttpException,
): HttpException {
  return isConflictCode(code) ? new ConflictException(code) : fallback();
}
