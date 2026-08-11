import { zodResolver } from "@hookform/resolvers/zod";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Checkbox, Form, Input } from "antd";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../../modules/auth/useAuth";
import { ROUTES } from "../../router/routes";
import { MessageError } from "../../shared/ui/message";
import loginBgVideoUrl from "../../../assets/login_bg.mp4";
// Vite 方式引入右侧背景图（由构建器处理为资源 URL）
import loginBgUrl from "../../../assets/login_bg.png";
import logoUrl from "../../../assets/logo.png";

const loginSchema = z.object({
  employeeId: z.string().min(1, "请输入工号或邮箱"),
  password: z.string().min(1, "请输入密码"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** 钉钉小 Logo：蓝色圆形底 + 白色钉钉风格符号（内联 SVG） */
function DingTalkLogo() {
  return (
    <svg
      aria-hidden="true"
      className="-mt-px"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
    >
      <circle cx="9" cy="9" fill="#1677ff" r="9" />
      <path
        d="M13.1 7.2c.2-.5.3-1 .2-1.5-1.4.4-2.3.3-3.6-.2-1.9-.7-3.6-.2-4.2 1.3-.4 1 0 2.1.7 2.9l-.4 1.8 1.9-.9c1.7.6 3.8.3 4.7-.8.4-.5.6-1 .7-1.6-.4.5-1 .8-1.7 1l1.7-2z"
        fill="#ffffff"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { error, isLoading, login, startDingTalkLogin, completeDingTalkLogin } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.marketplace;

  // Handle DingTalk SSO callback on mount.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("code") && params.has("state")) {
      completeDingTalkLogin().then((succeeded) => {
        if (succeeded) navigate(from, { replace: true });
      });
    }
  }, []); // eslint-disable-line

  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<LoginFormValues>({
    defaultValues: { employeeId: "", password: "" },
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    const succeeded = await login(values.employeeId, values.password);
    if (succeeded) {
      navigate(from, { replace: true });
    }
  });

  return (
    // 严格一屏：h-screen + overflow-hidden，任何分辨率下都不出现滚动条
    <div className="relative flex h-screen flex-col items-center overflow-hidden px-4 py-4 !pb-0 lg:px-8 box-border">
      {/* 全屏视频背景：自动播放、循环、静音、仅展示 */}
      <video
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted
        playsInline
        src={loginBgVideoUrl}
      />

      {/* 居中悬浮卡片容器：圆角 + 阴影，高度自适应且不超过视口 */}
      <div className="relative z-10 flex min-h-0 w-full max-w-[1200px] flex-1 overflow-hidden rounded-2xl bg-white/60 shadow-[0_28px_80px_rgba(23,58,138,0.18)]">
        {/* 左侧表单区 */}
        <div className="flex w-full min-w-0 flex-col overflow-hidden lg:w-[46%] lg:min-w-[440px] lg:max-w-[600px]">
          {/* 品牌区 */}
          <div className="flex items-center gap-3 px-8 pt-6 lg:px-12">
            <img alt="AI应用共享平台" className="h-9 w-auto" src={logoUrl} />
            <span className="text-xl font-bold text-black">
              AI应用共享平台
            </span>
          </div>

          {/* 表单主体：弹性垂直居中，空间不足时自动压缩间距 */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-8 py-3 lg:px-12">
            <div className="w-full max-w-[380px]">
              <h1 className="mb-2 text-3xl font-bold leading-tight text-gray-900 lg:text-4xl">
                欢迎登录
              </h1>
              {/* <p className="mb-6 text-sm text-gray-500">
                统一访问企业内部 AI 应用、创新需求与创作者中心
              </p> */}

              <MessageError active={Boolean(error)} cause={error} title="登录失败" />

              <form aria-label="登录表单" noValidate onSubmit={onSubmit}>
                {/* component={false} 仅提供 vertical 布局上下文，避免嵌套 form */}
                <Form component={false} layout="vertical">
                  <Form.Item
                    className="!mb-4"
                    help={errors.employeeId?.message}
                    label="工号 / 邮箱"
                    validateStatus={errors.employeeId ? "error" : ""}
                  >
                    <Controller
                      control={control}
                      name="employeeId"
                      render={({ field }) => (
                        <Input
                          {...field}
                          aria-label="工号 / 邮箱"
                          autoComplete="username"
                          placeholder="请输入工号或邮箱"
                          prefix={
                            <UserOutlined className="text-gray-400" />
                          }
                          size="large"
                        />
                      )}
                    />
                  </Form.Item>
                  <Form.Item
                    className="!mb-4"
                    help={errors.password?.message}
                    label="密码"
                    validateStatus={errors.password ? "error" : ""}
                  >
                    <Controller
                      control={control}
                      name="password"
                      render={({ field }) => (
                        <Input.Password
                          {...field}
                          aria-label="密码"
                          autoComplete="current-password"
                          placeholder="请输入密码"
                          prefix={
                            <LockOutlined className="text-gray-400" />
                          }
                          size="large"
                        />
                      )}
                    />
                  </Form.Item>
                </Form>

                {/* 记住我 + 忘记密码 */}
                <div className="mb-4 flex items-center justify-between">
                  <Checkbox defaultChecked>记住我</Checkbox>
                  <a
                    className="text-sm text-[var(--color-primary,#1677ff)]"
                    href="#"
                  >
                    忘记密码？
                  </a>
                </div>

                <Button
                  block
                  htmlType="submit"
                  loading={isLoading}
                  style={{
                    background: "var(--color-primary, #1677ff)",
                    borderColor: "var(--color-primary, #1677ff)",
                    borderRadius: 8,
                    height: 44,
                  }}
                  type="primary"
                >
                  登录
                </Button>
                <Button
                  block
                  className="!mt-3"
                  onClick={() => {
                    void startDingTalkLogin(from);
                  }}
                  style={{
                    borderColor: "var(--color-primary, #1677ff)",
                    borderRadius: 8,
                    color: "var(--color-primary, #1677ff)",
                    height: 44,
                  }}
                  type="default"
                >
                  <span className="inline-flex items-center gap-2">
                    <DingTalkLogo />
                    钉钉登录
                  </span>
                </Button>

                <p className="mt-3 text-center text-xs text-gray-400">
                  首次登录请绑定钉钉并设置本地密码 &gt;
                </p>
              </form>
            </div>
          </div>
        </div>

        {/* 右侧背景图区域（窄屏隐藏）：图片铺满，不留白边 */}
        <div className="relative hidden min-w-0 flex-1 lg:block">
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            src={loginBgUrl}
          />
        </div>
      </div>

      {/* 底部信息栏（悬浮卡片下方） */}
      <footer className="relative z-10 flex shrink-0 items-center justify-center gap-4 py-1">
        <span>--------</span>
        <span className="text-xs">
          企业内网访问 · 安全登录 · 支持账号密码与钉钉 SSO
        </span>
        <span>--------</span>
      </footer>
    </div>
  );
}
