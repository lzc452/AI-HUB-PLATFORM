import {
  BulbOutlined,
  LikeOutlined,
  RightOutlined,
  SearchOutlined,
  SendOutlined,
  StarFilled,
} from "@ant-design/icons";
import { Button, ConfigProvider, Input, Tag, Typography } from "antd";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { aiHubTheme } from "@ai-hub/ui";
import { MessageWarning } from "../../shared/ui/message";
import {
  assistantCapabilities,
  assistantGreeting,
  askAssistant,
  exampleQuestions,
  type RecommendedApp,
} from "../../modules/assistant/assistant.client";
import { useCatalogSearch } from "../../modules/marketplace/useCatalog";

const { Paragraph, Text, Title } = Typography;

const assistantTheme = {
  ...aiHubTheme,
  token: { ...aiHubTheme.token, colorPrimary: "#0060f0" },
};

interface ChatMessage {
  from: "ai" | "user";
  recommendations?: readonly RecommendedApp[];
  text: string;
}

function AppRecommendationCard({
  app,
  className = "",
}: {
  app: RecommendedApp;
  className?: string;
}) {
  return (
    <article
      className={`assistant-rise flex flex-col gap-2 rounded-xl border border-[#f0f0f0] bg-white p-3 shadow-sm transition-shadow hover:border-[#91caff] hover:shadow-md ${className}`}
    >
      <div className="flex items-start gap-2">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
          style={{ background: app.iconBackground, color: app.iconColor }}
        >
          {app.iconText}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Title
              className="!mb-0 !mt-0 !truncate !text-base"
              ellipsis={{ rows: 1 }}
              level={5}
              title={app.name}
            >
              {app.name}
            </Title>
            {app.badge ? (
              <Tag
                variant="filled"
                className="!mb-0 !mr-0 shrink-0"
                color={app.badge === "推荐" ? "blue" : "green"}
              >
                {app.badge}
              </Tag>
            ) : null}
          </div>
          <Paragraph
            className="!mb-0 !text-xs !text-[#999999]"
            ellipsis={{ rows: 2, tooltip: true }}
          >
            {app.summary}
          </Paragraph>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {app.tags.map((tag) => (
          <Tag variant="filled" className="!mr-0 !text-xs" key={tag}>
            {tag}
          </Tag>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3 text-[#8c8c8c]">
          <span className="inline-flex items-center gap-1">
            <StarFilled aria-hidden="true" className="text-[#fadb14]" />
            <Text className="!text-xs">{app.rating.toFixed(1)}</Text>
            <Text className="!text-xs !text-[#bfbfbf]">
              ({app.ratingCount})
            </Text>
          </span>
          <span className="!text-xs">使用量 {app.usage}</span>
        </div>
        <Link
          aria-label={`查看应用 ${app.name} 详情`}
          className="inline-flex items-center gap-0.5 !text-xs font-medium text-[#0060f0] hover:text-[#0048c0]"
          to={`/marketplace/${app.applicationId}`}
        >
          查看应用详情
          <RightOutlined aria-hidden="true" className="text-[10px]" />
        </Link>
      </div>
    </article>
  );
}

function CapabilityPanel() {
  const iconMap = {
    bulb: <BulbOutlined aria-hidden="true" />,
    like: <LikeOutlined aria-hidden="true" />,
    search: <SearchOutlined aria-hidden="true" />,
    send: <SendOutlined aria-hidden="true" />,
  };
  return (
    <aside aria-label="能力说明" className="hidden w-[300px] shrink-0 xl:block">
      <div className="rounded-xl border border-[#f0f0f0] bg-white p-4">
        <Title className="!mb-3 !mt-0 !text-sm" level={5}>
          能力说明
        </Title>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {assistantCapabilities.map((capability) => (
            <li className="flex gap-3" key={capability.title}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e6f0ff] text-[#0060f0]">
                {iconMap[capability.icon]}
              </span>
              <div className="min-w-0">
                <Text strong className="!text-sm">
                  {capability.title}
                </Text>
                <Paragraph className="!mb-0 !mt-0.5 !text-xs !text-[#8c8c8c]">
                  {capability.description}
                </Paragraph>
                {capability.tips ? (
                  <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#8c8c8c]">
                    {capability.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** AI 助手页：本地会话内消息，无对话后端时展示降级提示。 */
export default function AssistantPage() {
  const { data: catalog } = useCatalogSearch({
    page: 1,
    pageSize: 2,
    query: "",
    sort: "popular",
  });
  const recommendations = useMemo<RecommendedApp[]>(
    () =>
      (catalog?.items ?? []).map((entry, index) => ({
        applicationId: entry.applicationId,
        ...(entry.trustLabels.includes("recommended") ? { badge: "推荐" } : {}),
        iconBackground: index % 2 === 0 ? "#0060f0" : "#4ac78c",
        iconColor: "#ffffff",
        iconText: entry.name.slice(0, 1),
        name: entry.name,
        rating: entry.ratingAverage ?? 0,
        ratingCount: entry.ratingCount ?? 0,
        summary: entry.summary,
        tags: entry.tagIds,
        usage: "暂无数据",
      })),
    [catalog],
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: "ai",
      recommendations: [],
      text: assistantGreeting.leadIn,
    },
  ]);
  const [input, setInput] = useState("");
  const [degraded, setDegraded] = useState(false);

  const hasUserMessage = messages.some((message) => message.from === "user");

  useEffect(() => {
    setMessages((current) =>
      current.map((message, index) =>
        index === 0 && message.from === "ai"
          ? { ...message, recommendations }
          : message,
      ),
    );
  }, [recommendations]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setMessages((current) => [...current, { from: "user", text: trimmed }]);
    setInput("");
    void askAssistant({
      question: trimmed,
      context: { metricKey: "platform.application_views" },
    })
      .then((response) => {
        setDegraded(response.status === "degraded");
        setMessages((current) => [
          ...current,
          { from: "ai", text: response.answer },
        ]);
      })
      .catch(() => {
        setDegraded(true);
        setMessages((current) => [
          ...current,
          { from: "ai", text: "助手暂时不可用，请稍后重试。" },
        ]);
      });
  };

  return (
    <ConfigProvider theme={assistantTheme}>
      <div className="flex h-full flex-col gap-4">

        <div className="flex min-h-0 flex-1 gap-4">
          <section
            aria-label="AI 助手对话"
            className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#f0f0f0] bg-white"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {messages.map((message, index) => (
                <div
                  className={
                    message.from === "user"
                      ? "flex justify-end"
                      : "flex justify-start gap-2"
                  }
                  key={index}
                >
                  {message.from === "ai" ? (
                    <span
                      aria-hidden="true"
                      className="assistant-rise mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ background: "#695af3" }}
                    >
                      AI
                    </span>
                  ) : null}
                  <div
                    className={
                      message.from === "user"
                        ? "min-w-0 max-w-[85%]"
                        : "min-w-0 flex-1"
                    }
                  >
                    {message.from === "ai" ? (
                      <div className="assistant-rise rounded-xl bg-[#f5f7fa] px-4 py-3">
                        {index === 0 ? (
                          <>
                            <Title className="!mb-1 !mt-0" level={5}>
                              {assistantGreeting.title}
                            </Title>
                            <Paragraph className="!mb-2 !text-sm !text-[#595959]">
                              {message.text}
                            </Paragraph>
                          </>
                        ) : (
                          <Paragraph className="!mb-0 !text-sm !text-[#1f1f1f]">
                            {message.text}
                          </Paragraph>
                        )}
                        {message.recommendations ? (
                          <div className="mt-2 max-w-[560px] ">
                            {message.recommendations.map((app, cardIndex) => (
                              <Fragment key={app.applicationId}>
                                <AppRecommendationCard
                                  app={app}
                                  className={
                                    cardIndex === 1
                                      ? "w-[68%] self-end"
                                      : "w-[78%] self-end"
                                  }
                                />
                                {cardIndex === 0 && index === 0 ? (
                                  <Paragraph className="!my-2  !text-xs !text-[#8c8c8c]">
                                    {assistantGreeting.followUp}
                                  </Paragraph>
                                ) : null}
                              </Fragment>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="assistant-rise rounded-xl bg-[#0060f0] px-4 py-2 text-sm text-white">
                        {message.text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <MessageWarning
                active={degraded}
                content="AI 助手暂时不可用，请稍后重试"
              />
            </div>

            <div className="border-t border-[#f0f0f0] p-3">
              {!hasUserMessage ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {exampleQuestions.map((question) => (
                    <Button
                      key={question}
                      onClick={() => send(question)}
                      size="small"
                      type="default"
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                {/* <div className="flex items-center gap-1 pb-1">
                  <Button
                    aria-label="添加附件"
                    className="!text-[#8c8c8c]"
                    shape="circle"
                    type="text"
                  >
                    <PaperClipOutlined aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label="上传图片"
                    className="!text-[#8c8c8c]"
                    shape="circle"
                    type="text"
                  >
                    <PictureOutlined aria-hidden="true" />
                  </Button>
                </div> */}
                <Input.TextArea
                  aria-label="问题输入"
                  autoSize={{ maxRows: 4, minRows: 1 }}
                  className="flex-1"
                  onChange={(event) => setInput(event.target.value)}
                  onPressEnter={() => send(input)}
                  placeholder="输入您的问题，或描述您的使用场景…"
                  value={input}
                />
                <Button
                  icon={<SendOutlined aria-hidden="true" />}
                  onClick={() => send(input)}
                  type="primary"
                >
                  发送
                </Button>
              </div>
            </div>
          </section>

          <CapabilityPanel />
        </div>
      </div>
    </ConfigProvider>
  );
}
