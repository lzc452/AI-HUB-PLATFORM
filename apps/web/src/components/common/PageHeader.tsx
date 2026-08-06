import { Typography } from "antd";

const { Paragraph, Title } = Typography;

export interface PageHeaderProps {
  actions?: React.ReactNode;
  description?: React.ReactNode;
  title: string;
}

/** 页面标题区：h1 + 描述 + 操作区；面包屑由 AppShell 集中渲染。 */
export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <section
      aria-labelledby={`${title}-heading`}
      className="flex flex-wrap items-start justify-between gap-4"
    >
      <div className="space-y-2">
        <Title id={`${title}-heading`} level={1} className="!mb-0">
          {title}
        </Title>
        {description ? (
          <Paragraph className="!mb-0 max-w-3xl text-[#595959]">
            {description}
          </Paragraph>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
