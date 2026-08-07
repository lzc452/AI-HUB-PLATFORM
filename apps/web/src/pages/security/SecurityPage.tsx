import { Button, Descriptions, Spin, Tag, Typography } from "antd";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { useAuth } from "../../modules/auth/useAuth";
import { useActor } from "../../modules/auth/useIdentity";

const { Text, Title } = Typography;

export default function SecurityPage() {
  const { data, error, isError, isPending, refetch } = useActor();
  const { logout } = useAuth();

  return (
    <div className="space-y-4">
      {isPending ? <Spin aria-label="身份信息加载中" /> : null}
      {isError ? (
        <ErrorBlock
          description={error.message}
          onRetry={() => void refetch()}
          title="身份信息加载失败"
        />
      ) : null}
      {data ? (
        <section
          aria-labelledby="actor-heading"
          className="max-w-3xl rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
        >
          <Title id="actor-heading" level={2} className="!mb-3">
            当前身份
          </Title>
          <Descriptions
            column={1}
            items={[
              { key: "employeeId", label: "工号", children: data.employeeId },
              {
                key: "roles",
                label: "角色",
                children: (
                  <span className="flex flex-wrap gap-2">
                    {data.roleCodes.map((code) => (
                      <Tag key={code}>{code}</Tag>
                    ))}
                  </span>
                ),
              },
              {
                key: "departments",
                label: "部门",
                children: data.departmentIds.join("、"),
              },
              {
                key: "primaryDepartment",
                label: "主部门",
                children: data.primaryDepartmentId,
              },
              {
                key: "session",
                label: "会话 ID",
                children: <Text code>{data.sessionId}</Text>,
              },
            ]}
            size="small"
          />
          <div className="mt-4">
            <Button danger onClick={() => void logout()}>
              退出登录
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
