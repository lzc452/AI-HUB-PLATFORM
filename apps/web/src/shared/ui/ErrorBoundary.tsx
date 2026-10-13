import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Result, Typography } from "antd";

const { Text, Paragraph } = Typography;

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 渲染层兜底时展示的标题，便于区分「整站崩溃」与「局部模块崩溃」。 */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 渲染期错误兜底。
 *
 * 此前全项目零 ErrorBoundary：任一页面组件在渲染时抛错（大量 as 断言、
 * 非空断言、hook 顺序问题）都会导致整站白屏，只能靠用户硬刷新恢复。
 * 对审核工作台这类关键页面，白屏意味着审核员完全无法工作。
 *
 * 捕获后保留 traceId 与错误信息，便于把现场反馈给研发。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 渲染期错误必须留痕：既便于本地定位，也避免静默失败无人知晓。
    console.error(
      JSON.stringify({
        level: "error",
        msg: "react render error",
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack ?? null,
      }),
    );
  }

  private readonly handleReload = () => {
    window.location.reload();
  };

  private readonly handleReset = () => {
    this.setState({ error: null });
  };

  public override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <Result
        status="error"
        title={this.props.title ?? "页面渲染出错"}
        subTitle="当前页面遇到异常，其余功能不受影响。可尝试重新加载；若问题持续，请将下方错误信息反馈给管理员。"
        extra={[
          <Button key="reload" type="primary" onClick={this.handleReload}>
            重新加载页面
          </Button>,
          <Button key="reset" onClick={this.handleReset}>
            重试
          </Button>,
        ]}
      >
        <Paragraph>
          <Text type="secondary" style={{ fontSize: 12 }}>
            错误信息（反馈时请附上）：
          </Text>
        </Paragraph>
        <Paragraph>
          <Text code style={{ fontSize: 12, wordBreak: "break-all" }}>
            {error.message}
          </Text>
        </Paragraph>
      </Result>
    );
  }
}
