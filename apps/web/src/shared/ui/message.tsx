import { message } from "antd";
import { useEffect, useRef } from "react";

export function getMessageContent(cause: unknown, fallback: string): string {
  const detail =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  return detail ? `${fallback}：${detail}` : fallback;
}

export function showErrorMessage(cause: unknown, fallback: string): void {
  void message.error(getMessageContent(cause, fallback));
}

export function showWarningMessage(content: string): void {
  void message.warning(content);
}

export function showSuccessMessage(content: string): void {
  void message.success(content);
}

interface MessageNoticeProps {
  active?: boolean;
  content: string;
}

function useMessageNotice(
  active: boolean,
  content: string,
  notify: (content: string) => void,
): void {
  const lastContent = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      lastContent.current = null;
      return;
    }
    if (lastContent.current === content) {
      return;
    }
    lastContent.current = content;
    notify(content);
  }, [active, content, notify]);
}

export interface MessageErrorProps {
  active?: boolean;
  cause: unknown;
  title: string;
}

export function MessageError({
  active = true,
  cause,
  title,
}: MessageErrorProps): null {
  const content = getMessageContent(cause, title);
  useMessageNotice(active && cause != null, content, (value) => {
    void message.error(value);
  });
  return null;
}

export function MessageWarning({
  active = true,
  content,
}: MessageNoticeProps): null {
  useMessageNotice(active, content, showWarningMessage);
  return null;
}
