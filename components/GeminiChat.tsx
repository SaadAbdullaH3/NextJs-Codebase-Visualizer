"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Trash2, Sparkles, Loader2 } from "lucide-react";
import { useGraphStore } from "@/lib/graphStore";

interface Message {
  role: "user" | "model";
  content: string;
}

export function GeminiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const lockedEdgeId = useGraphStore((s) => s.lockedEdgeId);

  // Determine active context for the chatbot
  const activeContext = selectedNodeId || lockedEdgeId;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/graph-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          selectedContext: activeContext
        }),
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "model", content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: "System Alert: Network error. Failed to reach the Gemini API." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[280px] border-t border-[#2a2a3d] bg-[#12121a] shrink-0">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-2.5 border-b border-[#2a2a3d] bg-[#161622] shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 font-mono">
          <Sparkles size={14} />
          <span>NextVis AI</span>
        </div>
        <button
          onClick={clearHistory}
          disabled={messages.length === 0 || isLoading}
          className="text-[#6b6b7b] hover:text-red-400 disabled:opacity-50 transition-colors p-1 rounded"
          title="Clear Chat History"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-50">
            <Bot size={24} className="text-indigo-400" />
            <p className="text-[10px] text-gray-400 max-w-[200px] leading-relaxed">
              Ask me anything about your Next.js project architecture.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center ${msg.role === "user" ? "bg-blue-500/20 text-blue-400" : "bg-indigo-500/20 text-indigo-400"}`}>
                {msg.role === "user" ? <User size={12} /> : <Bot size={12} />}
              </div>
              <div className={`px-3 py-2 rounded-lg text-[11px] leading-relaxed max-w-[85%] whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-500/10 text-blue-100 border border-blue-500/20 rounded-tr-none" : "bg-[#1a1a2e] text-gray-300 border border-[#2a2a3d] rounded-tl-none font-mono"}`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-6 h-6 rounded flex items-center justify-center bg-indigo-500/20 text-indigo-400">
              <Bot size={12} />
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3d] rounded-tl-none flex items-center">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#161622] border-t border-[#2a2a3d] flex flex-col gap-2 shrink-0">
        {activeContext && (
          <div className="self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            CONTEXT: {activeContext.split("-->").pop()?.split("/").pop() || activeContext}
          </div>
        )}
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Ask about your architecture..."
            className="w-full bg-[#0a0a0f] border border-[#2a2a3d] rounded-md pl-3 pr-10 py-2 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:opacity-50 transition-colors rounded"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
