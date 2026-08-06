import { zodResolver } from "@hookform/resolvers/zod";
import { AppstoreOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Typography,
  message,
} from "antd";
import { Controller, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "../../modules/auth/useAuth";
import { ROUTES } from "../../router/routes";

const { Text, Title } = Typography;

const loginSchema = z.object({
  employeeId: z.string().min(1, "请输入员工工号"),
  password: z.string().min(1, "请输入密码"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { error, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.marketplace;

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
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <AppstoreOutlined
            aria-hidden="true"
            className="mb-1 text-3xl text-[#1677ff]"
          />
          <Title level={2} className="!mb-0">
            AI 应用市场
          </Title>
          <Text type="secondary">企业内部 AI 应用共享平台</Text>
        </div>
        <Title level={3} className="!mb-4 text-center">
          员工登录
        </Title>
        {error ? (
          <Alert
            className="!mb-4"
            description={error}
            showIcon
            title="登录失败"
            type="error"
          />
        ) : null}
        <form aria-label="登录表单" noValidate onSubmit={onSubmit}>
          <Form.Item
            help={errors.employeeId?.message}
            label="员工工号"
            validateStatus={errors.employeeId ? "error" : ""}
          >
            <Controller
              control={control}
              name="employeeId"
              render={({ field }) => (
                <Input
                  {...field}
                  aria-label="员工工号"
                  autoComplete="username"
                  placeholder="工号 / 邮箱"
                />
              )}
            />
          </Form.Item>
          <Form.Item
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
                />
              )}
            />
          </Form.Item>
          <Button block htmlType="submit" loading={isLoading} type="primary">
            登 录
          </Button>
        </form>
        <Divider plain>或</Divider>
        <Button
          block
          onClick={() => message.info("钉钉登录暂未配置，请联系管理员")}
        >
          钉钉扫码登录
        </Button>
        <p className="mt-5 text-center text-sm text-[#595959]">
          首次使用？请联系管理员开通账号
        </p>
      </Card>
    </div>
  );
}
