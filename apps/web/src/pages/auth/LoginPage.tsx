import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
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
    <div className="mx-auto max-w-md py-8">
      <Card>
        <div className="mb-6 space-y-2">
          <Text type="secondary">企业内部 AI 应用共享平台</Text>
          <Title level={1} className="!mb-0 !text-2xl">
            员工登录
          </Title>
        </div>
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
            登录
          </Button>
        </form>
      </Card>
    </div>
  );
}
