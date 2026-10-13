/**
 * 网关响应写入端口（PRD 8.2 流式契约）。
 *
 * **为什么不让 Nest 自动序列化**：`/v1` 有两件 Nest 默认管线管不了的事——
 * ① SSE 需要逐块写出并在中途失败时改发 `error` 事件；② 状态码必须严格贴合 OpenAI
 * 契约（200/429/503…），不能被框架默认值改写。因此这条路径统一通过端口写出，
 * 顺带把 HTTP 细节挡在服务层之外，测试时可用假 sink 驱动全部分支。
 *
 * 该端口是**服务层与 HTTP 之间的唯一接触面**：服务只认识这个接口，不认识 Express。
 */

export interface GatewayResponseSink {
  setHeader(name: string, value: string): void;
  /** 立即把响应头发出（SSE 必须先发头，客户端才会进入流式读取）。 */
  flushHeaders(): void;
  /** 写一段 SSE 数据（调用方保证已含 `data: …\n\n` 框架）。 */
  writeSse(chunk: string): void;
  /** 结束响应。 */
  end(): void;
  /** 以 JSON 结束响应（非流式成功路径）。 */
  json(status: number, body: unknown): void;
  /** 注册客户端断开回调（用于取消上游请求）。 */
  onClientClose(listener: () => void): void;
  /** 响应头是否已发出：决定错误是「改状态码」还是「发 SSE error 事件」。 */
  headersSent(): boolean;
}

export interface ExpressLikeRequest {
  /** Express/Nest 的 request 都提供 `on`；测试桩可以省略（此时不感知客户端断开）。 */
  on?: (event: string, listener: () => void) => unknown;
}

export interface ExpressLikeResponse {
  headersSent?: boolean;
  /** 响应是否已正常结束（用于区分「正常关闭」与「客户端中断」）。 */
  writableFinished?: boolean;
  on?: (event: string, listener: () => void) => unknown;
  setHeader(name: string, value: string): unknown;
  flushHeaders?: () => void;
  write(chunk: string): unknown;
  end(): unknown;
  status(code: number): ExpressLikeResponse;
  json(body: unknown): unknown;
}

export function createExpressSink(
  request: ExpressLikeRequest,
  response: ExpressLikeResponse,
): GatewayResponseSink {
  return {
    setHeader(name, value) {
      response.setHeader(name, value);
    },
    flushHeaders() {
      response.flushHeaders?.();
    },
    writeSse(chunk) {
      response.write(chunk);
    },
    end() {
      // 幂等：客户端断开后再 end 会抛 ERR_STREAM_WRITE_AFTER_END
      try {
        response.end();
      } catch {
        // 已结束/已断开，忽略
      }
    },
    json(status, body) {
      response.status(status).json(body);
    },
    onClientClose(listener) {
      // **必须监听响应而不是请求**：请求体读完后 `req` 的 `close` 不再反映客户端中断。
      // 响应的 `close` 在正常结束（writableFinished=true）与客户端中断时都会触发，
      // 因此用 `writableFinished` 把「正常收尾」排除掉，只把真正的中断当作断流。
      response.on?.("close", () => {
        if (response.writableFinished !== true) listener();
      });
      // 兜底：部分代理/适配层只在请求侧报关闭
      request.on?.("close", () => {
        if (response.writableFinished !== true) listener();
      });
    },
    headersSent() {
      return response.headersSent === true;
    },
  };
}
