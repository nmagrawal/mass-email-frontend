"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/apiClient";
import {
  Loader2,
  Send,
  Phone,
  Clock,
  MessageCircle,
  RefreshCw,
  Search,
  X,
  Type,
  FileText,
} from "lucide-react";

interface SmsChatDetailProps {
  voter: Voter | null;
}

export interface Voter {
  id: string;
  name?: string | null;
  phone: string;
  normalizedPhone?: string | null;
  lastMessage?: string | null;
  lastMessageTime?: string | null;
  unreadCount?: number | null;
}

interface Message {
  id?: string;
  text: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  campaign?: string;
  full_name?: string;
  phone?: string;
}

interface Template {
  _id?: string;
  id?: string;
  name: string;
  body: string;
  media_url?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ChatApiResponse {
  voter?: Voter;
  messages?: Message[];
  error?: string;
  message?: string;
  detail?: Array<{ msg?: string }>;
}

type ReplyMode = "normal" | "template";

const LONG_MESSAGE_LIMIT = 260;

export function SmsChatDetail({ voter }: SmsChatDetailProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [replyMode, setReplyMode] = useState<ReplyMode>("normal");
  const [normalMessage, setNormalMessage] = useState("");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  const [campaignName, setCampaignName] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<
    Record<string, boolean>
  >({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const templatePickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        templatePickerRef.current &&
        !templatePickerRef.current.contains(target)
      ) {
        setTemplateDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!voter?.id) {
      setMessages([]);
      setError(null);
      setExpandedMessages({});
      setCampaignName("");
      setNormalMessage("");
      setSelectedTemplate("");
      setTemplateSearch("");
      return;
    }

    fetchChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voter?.id]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior,
        block: "end",
      });
    });
  }

  function getTemplateId(template: Template) {
    return template._id || template.id || "";
  }

  function normalizePhone(phone: string) {
    return phone.replace(/[^\d+]/g, "").trim();
  }

  function isValidPhone(phone: string) {
    const normalized = normalizePhone(phone);
    return /^\+?\d{7,15}$/.test(normalized);
  }

  function getSmsSegments(text: string) {
    if (!text.trim()) return 0;
    return Math.ceil(text.length / 160);
  }

  async function getErrorMessage(res: Response, fallback: string) {
    try {
      const data = await res.json();

      if (typeof data?.detail === "string") return data.detail;

      if (Array.isArray(data?.detail)) {
        return (
          data.detail
            .map((item: any) => item?.msg || item?.message)
            .filter(Boolean)
            .join(", ") || fallback
        );
      }

      return data?.error || data?.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function fetchTemplates() {
    try {
      setTemplatesLoading(true);
      setError(null);

      const res = await apiFetch("/api/sms/templates/");

      if (!res.ok) {
        const message = await getErrorMessage(res, "Failed to fetch templates");
        throw new Error(message);
      }

      const data = await res.json();

      const templatesList = Array.isArray(data)
        ? data
        : Array.isArray(data?.templates)
          ? data.templates
          : [];

      setTemplates(templatesList);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch templates";

      setError(message);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function getMessageKey(message: Message, index: number) {
    return message.id || `${message.timestamp}-${index}`;
  }

  function toggleReadMore(messageKey: string) {
    setExpandedMessages((prev) => ({
      ...prev,
      [messageKey]: !prev[messageKey],
    }));
  }

  function getDisplayText(text: string, isExpanded: boolean) {
    if (!text) return "";

    if (isExpanded || text.length <= LONG_MESSAGE_LIMIT) {
      return text;
    }

    return `${text.slice(0, LONG_MESSAGE_LIMIT).trim()}...`;
  }

  async function fetchChat(isRefresh = false) {
    if (!voter?.id) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const res = await fetch(`/api/inbound-messages/${voter.id}`, {
        method: "GET",
        cache: "no-store",
      });

      const data: ChatApiResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data?.detail?.[0]?.msg ||
          data?.message ||
          data?.error ||
          "Failed to fetch chat"
        );
      }

      const nextMessages = Array.isArray(data.messages) ? data.messages : [];

      nextMessages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      setMessages(nextMessages);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";

      setError(message);
      console.error("Error fetching chat:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function formatMessageTime(timestamp?: string | null) {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMessageDate(timestamp?: string | null) {
    if (!timestamp) return "";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function shouldShowDateSeparator(current: Message, previous?: Message) {
    if (!previous) return true;

    const currentDate = formatMessageDate(current.timestamp);
    const previousDate = formatMessageDate(previous.timestamp);

    return currentDate !== previousDate;
  }

  function selectTemplate(template: Template) {
    const id = getTemplateId(template);

    if (!id) {
      setError("Template ID is missing");
      return;
    }

    setSelectedTemplate(id);
    setTemplateSearch(template.name || "");
    setTemplateDropdownOpen(false);
  }

  function clearSelectedTemplate() {
    setSelectedTemplate("");
    setTemplateSearch("");
    setTemplateDropdownOpen(false);
  }

  function switchReplyMode(mode: ReplyMode) {
    setReplyMode(mode);
    setError(null);

    if (mode === "normal") {
      setSelectedTemplate("");
      setTemplateSearch("");
      setTemplateDropdownOpen(false);
    }

    if (mode === "template") {
      setNormalMessage("");
    }
  }

  async function sendNormalPrivateMessage(messageText: string) {
    if (!voter) return;

    const phone = normalizePhone(voter.phone || voter.normalizedPhone || "");

    if (!phone) {
      throw new Error("Voter phone number is missing");
    }

    if (!isValidPhone(phone)) {
      throw new Error("Voter phone number is invalid");
    }

    const payload = {
      voterId: voter.id,
      phone,
      message: messageText,
    };
    const res = await fetch("/api/private-message/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const message = await getErrorMessage(
        res,
        "Failed to send normal message"
      );
      throw new Error(message);
    }

    const newMessage: Message = {
      id: `local-private-${Date.now()}`,
      text: messageText,
      direction: "outbound",
      timestamp: new Date().toISOString(),
      phone,
      campaign: "Private Message",
    };

    setMessages((prev) => [...prev, newMessage]);
    setNormalMessage("");
    setCampaignName("");

    window.setTimeout(() => {
      fetchChat(true);
    }, 1000);
  }

  async function sendSingleContactCampaign(params: {
    templateId: string;
    messageText: string;
    campaignLabel?: string;
  }) {
    if (!voter) return;

    const phone = normalizePhone(voter.phone || voter.normalizedPhone || "");

    if (!phone) {
      throw new Error("Voter phone number is missing");
    }

    if (!isValidPhone(phone)) {
      throw new Error("Voter phone number is invalid");
    }

    const campaignLabel =
      params.campaignLabel?.trim() ||
      campaignName.trim() ||
      `Template Reply - ${voter.name || voter.phone || "voter"
      } - ${new Date().toLocaleString("en-IN")}`;

    const payload = {
      campaign_name: campaignLabel,
      template_id: params.templateId,
      audience: {
        contacts: [
          {
            phone,
            name: voter.name?.trim() || undefined,
          },
        ],
      },
    };

    const res = await apiFetch("/api/sms/campaign/", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const message = await getErrorMessage(res, "Failed to send message");
      throw new Error(message);
    }

    const newMessage: Message = {
      id: `local-campaign-${Date.now()}`,
      text: params.messageText,
      direction: "outbound",
      timestamp: new Date().toISOString(),
      phone,
      campaign: campaignLabel,
    };

    setMessages((prev) => [...prev, newMessage]);
    setCampaignName("");

    window.setTimeout(() => {
      fetchChat(true);
    }, 1000);
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();

    if (!voter) return;

    try {
      setSending(true);
      setError(null);

      if (replyMode === "normal") {
        const messageText = normalMessage.trim();

        if (!messageText) {
          setError("Please type a message");
          return;
        }

        await sendNormalPrivateMessage(messageText);
      }

      if (replyMode === "template") {
        if (!selectedTemplate) {
          setError("Please select a template before sending");
          return;
        }

        const selectedTemplateData = templates.find(
          (template) => getTemplateId(template) === selectedTemplate
        );

        if (!selectedTemplateData) {
          setError("Selected template was not found");
          return;
        }

        await sendSingleContactCampaign({
          templateId: selectedTemplate,
          messageText: selectedTemplateData.body || selectedTemplateData.name,
          campaignLabel:
            campaignName.trim() ||
            `Template Reply - ${voter.name || voter.phone || "voter"}`,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";

      setError(message);
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  }

  const selectedTemplateData = useMemo(() => {
    return templates.find(
      (template) => getTemplateId(template) === selectedTemplate
    );
  }, [templates, selectedTemplate]);

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();

    if (!query || selectedTemplateData?.name === templateSearch) {
      return templates;
    }

    return templates.filter((template) => {
      const name =
        typeof template.name === "string" ? template.name.toLowerCase() : "";

      const body =
        typeof template.body === "string" ? template.body.toLowerCase() : "";

      return name.includes(query) || body.includes(query);
    });
  }, [templates, templateSearch, selectedTemplateData]);

  const selectedTemplateBody = selectedTemplateData?.body || "";
  const selectedTemplateSegments = getSmsSegments(selectedTemplateBody);
  const normalMessageSegments = getSmsSegments(normalMessage);

  const canSend =
    Boolean(voter?.phone || voter?.normalizedPhone) &&
    !sending &&
    !templatesLoading &&
    (replyMode === "normal"
      ? Boolean(normalMessage.trim())
      : Boolean(selectedTemplate));

  if (!voter) {
    return (
      <div className="h-full min-h-0 flex flex-col items-center justify-center bg-linear-to-br from-slate-900 to-slate-800 text-slate-400 overflow-hidden">
        <MessageCircle size={64} className="opacity-20 mb-4" />

        <p className="text-lg font-semibold">Select a conversation to start</p>

        <p className="text-sm text-slate-500 mt-1">
          Click on any conversation from the list
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      <div className="shrink-0 bg-linear-to-r from-slate-800 to-slate-700 border-b border-slate-700 px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-white truncate">
              {voter.name || voter.phone || "Unknown Sender"}
            </h2>

            <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
              <Phone size={14} />

              <span className="truncate">
                {voter.phone || voter.normalizedPhone || voter.id}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex text-sm text-slate-400 items-center gap-2">
              <Clock size={16} />
              Conversation
            </div>

            <button
              type="button"
              onClick={() => fetchChat(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-600/60 hover:bg-slate-600 text-slate-300 hover:text-white transition disabled:opacity-60"
              title="Refresh chat"
            >
              <RefreshCw
                size={17}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="animate-spin text-cyan-400" size={40} />

            <p className="text-slate-400 mt-3">Loading messages...</p>
          </div>
        ) : error ? (
          <div className="text-center p-4 bg-red-500/10 text-red-300 rounded-lg border border-red-500/20">
            <p className="font-semibold mb-1">Could not load chat</p>
            <p>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <MessageCircle size={48} className="opacity-20 mx-auto mb-2" />
              <p>No messages found for this voter</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const messageKey = getMessageKey(message, index);

              const previousMessage =
                index > 0 ? messages[index - 1] : undefined;

              const showDate = shouldShowDateSeparator(
                message,
                previousMessage
              );

              const isLongMessage =
                typeof message.text === "string" &&
                message.text.length > LONG_MESSAGE_LIMIT;

              const isExpanded = expandedMessages[messageKey] === true;

              const displayText = getDisplayText(message.text, isExpanded);

              return (
                <React.Fragment key={messageKey}>
                  {showDate && (
                    <div className="flex justify-center">
                      <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                        {formatMessageDate(message.timestamp)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex ${message.direction === "outbound"
                        ? "justify-end"
                        : "justify-start"
                      } animate-fadeIn`}
                  >
                    <div
                      className={`rounded-2xl px-5 py-3 max-w-xs lg:max-w-md shadow-lg transition-all hover:shadow-xl ${message.direction === "outbound"
                          ? "bg-linear-to-r from-cyan-500 to-blue-500 text-white rounded-br-none"
                          : "bg-slate-700/80 text-slate-100 rounded-bl-none border border-slate-600"
                        }`}
                    >
                      <p className="text-sm leading-relaxed break-words whitespace-pre-line">
                        {displayText}
                      </p>

                      {isLongMessage && (
                        <button
                          type="button"
                          onClick={() => toggleReadMore(messageKey)}
                          className={`mt-2 text-xs font-semibold underline underline-offset-2 transition ${message.direction === "outbound"
                              ? "text-white/90 hover:text-white"
                              : "text-cyan-300 hover:text-cyan-200"
                            }`}
                        >
                          {isExpanded ? "Show less" : "Read more"}
                        </button>
                      )}

                      <div className="flex items-center justify-end gap-2 mt-2 text-xs opacity-70">
                        {message.campaign && (
                          <span className="px-2 py-0.5 bg-white/20 rounded-full">
                            {message.campaign}
                          </span>
                        )}

                        <span>{formatMessageTime(message.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-700 bg-slate-800/50 backdrop-blur p-4">
        <form onSubmit={handleSendReply} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => switchReplyMode("normal")}
              disabled={sending}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${replyMode === "normal"
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                  : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
            >
              <Type size={16} />
              Normal Message
            </button>

            <button
              type="button"
              onClick={() => switchReplyMode("template")}
              disabled={sending}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${replyMode === "template"
                  ? "bg-purple-500/15 border-purple-500/40 text-purple-200"
                  : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
            >
              <FileText size={16} />
              Template Message
            </button>
          </div>

          {replyMode === "normal" && (
            <div className="space-y-2">
              <Input
                placeholder="Type normal message..."
                value={normalMessage}
                onChange={(e) => setNormalMessage(e.target.value)}
                disabled={sending}
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>This will send as a direct private message.</span>

                <span
                  className={
                    normalMessageSegments <= 1
                      ? "text-cyan-300"
                      : "text-orange-300"
                  }
                >
                  {normalMessage.length} chars · {normalMessageSegments} SMS
                </span>
              </div>
            </div>
          )}

          {replyMode === "template" && (
            <div className="space-y-2">
              <div ref={templatePickerRef} className="relative">
                <div className="relative">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <Input
                    value={templateSearch}
                    onChange={(e) => {
                      setTemplateSearch(e.target.value);
                      setSelectedTemplate("");
                      setTemplateDropdownOpen(true);
                    }}
                    onFocus={() => setTemplateDropdownOpen(true)}
                    placeholder={
                      templatesLoading
                        ? "Loading templates..."
                        : "Search and select SMS template"
                    }
                    disabled={templatesLoading || sending}
                    className="pl-10 pr-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />

                  {templateSearch && (
                    <button
                      type="button"
                      onClick={clearSelectedTemplate}
                      disabled={sending}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white disabled:opacity-60"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {templateDropdownOpen && (
                  <div className="absolute bottom-full z-30 mb-2 w-full max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                    {templatesLoading ? (
                      <div className="p-4 text-slate-300 flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Loading templates...
                      </div>
                    ) : filteredTemplates.length === 0 ? (
                      <div className="p-4 text-slate-400">
                        No template found. Try another keyword.
                      </div>
                    ) : (
                      filteredTemplates.map((template) => {
                        const templateId = getTemplateId(template);
                        const isSelected = templateId === selectedTemplate;
                        const segments = getSmsSegments(template.body || "");

                        return (
                          <button
                            key={templateId}
                            type="button"
                            onClick={() => selectTemplate(template)}
                            className={`w-full text-left p-4 border-b border-slate-800 hover:bg-slate-800/80 transition-colors ${isSelected ? "bg-cyan-500/10" : ""
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {template.name}
                                </p>
                                <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                                  {template.body}
                                </p>
                              </div>

                              <div className="shrink-0 flex flex-col items-end gap-1">
                                <span className="text-xs text-slate-500">
                                  {template.body?.length || 0} chars
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full border ${segments <= 1
                                      ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
                                      : "text-orange-300 border-orange-500/30 bg-orange-500/10"
                                    }`}
                                >
                                  {segments} SMS
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {selectedTemplateData && (
                <div className="p-3 bg-slate-950/60 border border-slate-700 rounded-xl">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-xs text-slate-400 font-semibold">
                      SELECTED TEMPLATE
                    </p>

                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${selectedTemplateSegments <= 1
                          ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
                          : "text-orange-300 border-orange-500/30 bg-orange-500/10"
                        }`}
                    >
                      {selectedTemplateSegments} SMS
                    </span>
                  </div>

                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words line-clamp-3">
                    {selectedTemplateBody}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Input
              placeholder="Campaign name optional"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              disabled={sending}
              className="flex-1 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />

            <Button
              type="submit"
              disabled={!canSend}
              className="bg-linear-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl px-6 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/50"
            >
              {sending ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}