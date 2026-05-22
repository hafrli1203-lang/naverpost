"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send } from "lucide-react";
import type { ChatMessage } from "@/types";

interface ArticleChatProps {
  messages: ChatMessage[];
  onSend: (instruction: string) => void | Promise<void>;
  isLoading: boolean;
}

const EXAMPLES = [
  "멀티포컬은 콘택트렌즈인데 다초점 안경렌즈로 설명했어요. 콘택트렌즈 기준으로 다시 써주세요.",
  "기능성렌즈를 코팅 기능으로만 설명했는데 눈 피로 감소 렌즈 관점으로 고쳐주세요.",
];

export function ArticleChat({ messages, onSend, isLoading }: ArticleChatProps) {
  const [input, setInput] = useState("");

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await onSend(text);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-500" />
          채팅으로 수정 지시
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length > 0 && (
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user" ? "flex justify-end" : "flex justify-start"
                }
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-xs leading-5 text-white"
                      : "max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-xs leading-5 text-gray-700"
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              글이 키워드 의미와 어긋나면 이유를 적어 다시 쓰게 할 수 있어요. 예시
            </p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                disabled={isLoading}
                className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-left text-xs text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="어디가 어떻게 틀렸는지 적어주세요. (Ctrl/Cmd + Enter 전송)"
          className="min-h-[72px] text-sm"
          disabled={isLoading}
        />

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSend} disabled={isLoading || !input.trim()} className="gap-2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isLoading ? "수정 중..." : "지시 전송"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
