import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Typography } from "antd";
import { useState } from "react";

import { PageHeader } from "../../components/common/PageHeader";

const { Text, Title } = Typography;

interface ChatMessage {
  from: "ai" | "user";
  text: string;
}

const exampleQuestions = [
  "有什么适合数据分析的应用？",
  "帮我找协作办公类应用",
  "推荐最近上架的应用",
];

/** AI 助手页骨架：本地会话内消息，无 Dify 后端时展示降级提示。 */
export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [degraded, setDegraded] = useState(false);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setMessages((current) => [...current, { from: "user", text: trimmed }]);
    setDegraded(true);
    setInput("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        description="我可以帮助您搜索和推荐合适的应用"
        title="AI 助手"
      />
      <section
        aria-label="AI 助手对话"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-6"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <RobotOutlined
              aria-hidden="true"
              className="text-4xl text-[#722ed1]"
            />
            <Title level={3} className="!mb-0">
              你好，我是 AI 助手
            </Title>
            <Text type="secondary">我可以帮助您搜索和推荐合适的应用</Text>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {exampleQuestions.map((question) => (
                <Button
                  key={question}
                  onClick={() => send(question)}
                  size="small"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-3 p-0">
            {messages.map((message, index) => (
              <li
                className={
                  message.from === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
                key={index}
              >
                <div
                  className={
                    message.from === "user"
                      ? "max-w-[75%] rounded-xl bg-[#1677ff] px-4 py-2 text-white"
                      : "max-w-[75%] rounded-xl bg-[#f5f5f5] px-4 py-2 text-[#1f1f1f]"
                  }
                >
                  {message.text}
                </div>
              </li>
            ))}
            {degraded ? (
              <li>
                <Alert
                  message="AI 助手暂时不可用，请稍后重试"
                  showIcon
                  type="warning"
                />
              </li>
            ) : null}
          </ul>
        )}
        <div className="mt-6 flex items-start gap-2">
          <Input.TextArea
            aria-label="问题输入"
            autoSize={{ maxRows: 4, minRows: 1 }}
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={() => send(input)}
            placeholder="输入您的问题…"
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
      </section>
    </div>
  );
}
