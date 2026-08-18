import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "已超时";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return days > 0
    ? `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * SLA 剩余时间倒计时。
 * 每秒刷新一次；组件卸载或 dueAt 变化时清除定时器，避免页面残留计时器。
 */
export function SlaCountdown({
  className,
  dueAt,
}: {
  className?: string;
  dueAt: string | null | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dueAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [dueAt]);

  if (!dueAt) {
    return <span className={className}>-</span>;
  }
  return (
    <span className={className}>
      {formatRemaining(new Date(dueAt).getTime() - now)}
    </span>
  );
}
