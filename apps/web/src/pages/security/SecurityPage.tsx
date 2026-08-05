import { Alert, Button, Descriptions, Spin, Tag, Typography } from "antd";

import { useAuth } from "../../modules/auth/useAuth";
import { useActor } from "../../modules/auth/useIdentity";

const { Paragraph, Text, Title } = Typography;

export default function SecurityPage() {
  const { data, error, isError, isPending } = useActor();
  const { logout } = useAuth();

  return (
    <div className="space-y-6">
      <section aria-labelledby="security-heading" className="space-y-3">
        <Text type="secondary">Phase 2 / Security</Text>
        <Title id="security-heading" level={1} className="!mb-0">
          Security
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          当前登录身份、角色与部门授权来自内部身份 API；会话可在此处退出。
        </Paragraph>
      </section>
      {isPending ? <Spin aria-label="身份信息加载中" /> : null}
      {isError ? (
        <Alert
          description={error.message}
          showIcon
          title="身份信息加载失败"
          type="error"
        />
      ) : null}
      {data ? (
        <section
          aria-labelledby="actor-heading"
          className="max-w-3xl rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
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
