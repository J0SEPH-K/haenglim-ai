import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConversationStore } from '../../stores/conversationStore';
import { sendMessage } from '../../api/messages';
import type { DocumentInfo } from '../../api/messages';
import ModelSelector from './ModelSelector';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import type { AIProvider, Message } from '../../types';
import { ImagePlus } from 'lucide-react';

export default function ChatView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeConversation, fetchConversation, createConversation, deleteConversation, addMessages, fetchConversations, clearActive } =
    useConversationStore();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const handleModelChange = (p: AIProvider, modelId?: string) => {
    setSelectedProvider(p);
    setModelOverride(modelId || null);
  };
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>();
  const [typingMsgId, setTypingMsgId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const dragCounter = useRef(0);

  const [pendingUserMsg, setPendingUserMsg] = useState<{ text: string; imageUrls?: string[]; documents?: DocumentInfo[] } | null>(null);
  const messages = activeConversation?.messages || [];
  const isNewChat = !id && messages.length === 0 && !pendingUserMsg;
  const isOwner = activeConversation?.is_owner !== false;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    setTypingMsgId(null);
    if (id) {
      fetchConversation(Number(id));
    } else {
      clearActive();
    }
  }, [id]);

  // Initialize selectedProvider from conversation's provider when conversation changes
  useEffect(() => {
    if (activeConversation?.conversation.ai_provider) {
      setSelectedProvider(activeConversation.conversation.ai_provider);
    }
  }, [activeConversation?.conversation.id]);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages]);

  const mockResponses: Record<string, { text: string; delay: number; image_url?: string }> = {
    '1': {
      text: '서울에서 가장 인기 있는 관광지를 추천해드릴게요!\n\n**역사 & 문화**\n- 경복궁 — 조선시대 대표 궁궐, 한복 체험 가능\n- 북촌 한옥마을 — 전통 한옥이 밀집한 아름다운 골목길\n- 종묘 — 유네스코 세계문화유산\n\n**현대 & 트렌드**\n- 강남/가로수길 — 쇼핑과 카페 거리\n- 홍대 — 젊은 문화와 예술의 중심지\n- 성수동 — 힙한 카페와 팝업스토어\n\n**자연 & 힐링**\n- 남산타워 — 서울 전경을 한눈에\n- 한강공원 — 자전거, 피크닉, 치맥\n- 북한산 — 도심 속 등산 코스\n\n어떤 스타일의 여행을 선호하시나요?',
      delay: 2000,
    },
    '2': {
      text: '# 한국 음식 가이드 🍽️\n\n한국의 대표 음식들을 소개해드릴게요!\n\n## 🥘 찌개 & 탕\n\n| 음식 | 특징 | 매운 정도 |\n|------|------|-----------|\n| 김치찌개 | 한국인의 소울푸드 | 🌶️🌶️ |\n| 된장찌개 | 구수한 맛의 정석 | 🌶️ |\n| 순두부찌개 | 부드럽고 얼큰한 맛 | 🌶️🌶️🌶️ |\n\n## 🥩 고기\n\n1. **삼겹살** — 소주와 함께하는 *국민 음식*\n2. **불고기** — 달콤한 양념의 소고기\n3. **치킨** — 다양한 맛의 한국식 프라이드치킨\n\n> 💡 **팁**: 삼겹살은 반드시 쌈장과 함께 상추에 싸서 드세요!\n\n## 🍜 면 & 밥\n\n- 비빔밥 — 다양한 나물과 고추장\n- 냉면 — 시원한 여름 별미\n- ~~라면~~ 떡볶이 — 매콤달콤한 간식의 왕\n\n---\n\n### 주문할 때 유용한 한국어\n\n```\n이거 하나 주세요 — Can I have one of this?\n맵지 않게 해주세요 — Please make it not spicy\n계산이요 — Check please\n```\n\n더 자세한 정보는 [한국관광공사](https://korean.visitkorea.or.kr)에서 확인하세요!\n\n맛있는 한국 여행 되세요! 😋',
      delay: 3000,
    },
  };

  const handleTypingTick = useCallback(() => {
    if (isAtBottomRef.current) {
      scrollToBottom('instant');
    }
  }, [scrollToBottom]);

  const handleSend = async (text: string, imageUrls?: string[], documents?: DocumentInfo[]) => {
    setError('');

    const trimmed = text.trim();
    const mockKey = Object.keys(mockResponses).find((k) => trimmed === k);

    // Show user message immediately while loading
    setPendingUserMsg({ text: trimmed, imageUrls, documents });
    setSending(true);
    // Scroll after state update
    setTimeout(() => scrollToBottom(), 50);

    if (mockKey) {
      const mock = mockResponses[mockKey];
      const now = new Date().toISOString();
      const userMsg: Message = {
        id: Date.now(),
        conversation_id: 0,
        role: 'user',
        text: trimmed,
        image_url: imageUrls?.[0] || null,
        message_type: imageUrls ? 'image_input' : 'text',
        image_params: imageUrls ? { image_urls: imageUrls } : null,
        created_at: now,
      };
      addMessages([userMsg]);
      setPendingUserMsg(null);
      await new Promise((r) => setTimeout(r, mock.delay));
      const msgId = Date.now() + 1;
      const assistantMsg: Message = {
        id: msgId,
        conversation_id: 0,
        role: 'assistant',
        text: mock.text,
        image_url: mock.image_url || null,
        message_type: 'text',
        image_params: null,
        created_at: new Date().toISOString(),
      };
      setTypingMsgId(msgId);
      addMessages([assistantMsg]);
      setSending(false);
      return;
    }

    if (!selectedProvider) {
      setError('모델을 선택해주세요');
      setSending(false);
      setPendingUserMsg(null);
      return;
    }

    let isNewConversation = false;
    let convId = activeConversation?.conversation.id;
    try {
      if (!convId) {
        const conv = await createConversation('chat');
        convId = conv.id;
        isNewConversation = true;
      }
      const result = await sendMessage(convId, text, imageUrls, selectedProvider.id, documents, modelOverride);
      setPendingUserMsg(null);
      if (isNewConversation) {
        navigate(`/chat/${convId}`, { replace: true });
        await fetchConversation(convId);
      }
      setTypingMsgId(result.assistant_message.id);
      addMessages([result.user_message, result.assistant_message]);
      fetchConversations();
    } catch (e: any) {
      setPendingUserMsg(null);
      if (isNewConversation && convId) {
        try { await deleteConversation(convId); } catch { /* ignore cleanup error */ }
        navigate('/chat', { replace: true });
      }
      setError(e.response?.data?.detail || '메시지 전송에 실패했습니다');
    } finally {
      setSending(false);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  // 첫 프롬프트 전송 중 — 입력바 하단 고정 + 사용자 메시지 표시
  if (!id && pendingUserMsg) {
    return (
      <div
        className="h-full flex flex-col relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Scrollable messages area */}
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4 pb-4">
            <MessageBubble
              message={{
                id: -1,
                conversation_id: 0,
                role: 'user',
                text: pendingUserMsg.text,
                image_url: pendingUserMsg.imageUrls?.[0] || null,
                message_type: pendingUserMsg.imageUrls ? 'image_input' : 'text',
                image_params: {
                  ...(pendingUserMsg.imageUrls ? { image_urls: pendingUserMsg.imageUrls } : {}),
                  ...(pendingUserMsg.documents ? { documents: pendingUserMsg.documents.map(d => ({ url: d.url, name: d.original_name, thumbnail_url: d.thumbnail_url, page_count: d.page_count })) } : {}),
                },
                created_at: new Date().toISOString(),
              }}
            />
            {sending && (
              <div className="flex items-center gap-1.5 py-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          {error && <div className="max-w-4xl mx-auto px-4 py-2 text-sm text-red-400 bg-red-900/30">{error}</div>}
        </div>
        {/* Input bar pinned to bottom, outside scroll */}
        <div className="max-w-4xl mx-auto w-full" style={{ background: 'linear-gradient(to bottom, transparent 50%, #212121 50%)' }}>
          <ChatInput onSend={handleSend} disabled={sending} droppedFiles={droppedFiles} rightElement={
            <ModelSelector value={selectedProvider?.id ?? null} modelOverride={modelOverride} onChange={handleModelChange} compact />
          } />
        </div>
      </div>
    );
  }

  // 새 대화 — 중앙 정렬 레이아웃
  if (isNewChat) {
    return (
      <div
        className="h-full flex flex-col items-center px-4 relative"
        style={{ paddingTop: '31vh' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {dragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#212121]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-blue-500 rounded-2xl bg-[#2f2f2f]/80">
              <ImagePlus className="w-10 h-10 text-blue-400" />
              <span className="text-blue-400 font-medium">파일을 여기에 놓으세요</span>
            </div>
          </div>
        )}
        <div className="w-full max-w-4xl space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white">무엇을 도와드릴까요?</h2>
          </div>
          {error && <div className="text-sm text-red-400 bg-red-900/30 rounded-lg px-4 py-2 text-center">{error}</div>}
          <ChatInput
            onSend={handleSend}
            disabled={sending}
            droppedFiles={droppedFiles}
            rightElement={
              <ModelSelector value={selectedProvider?.id ?? null} modelOverride={modelOverride} onChange={handleModelChange} compact />
            }
          />
        </div>
      </div>
    );
  }

  // 메시지가 있는 표준 레이아웃
  return (
    <div
      className="h-full flex flex-col relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#212121]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-blue-500 rounded-2xl bg-[#2f2f2f]/80">
            <ImagePlus className="w-10 h-10 text-blue-400" />
            <span className="text-blue-400 font-medium">파일을 여기에 놓으세요</span>
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="p-3 border-b-2 border-[#2f2f2f] flex items-center gap-3">
        {activeConversation && (
          <div className="text-sm">
            <span className="font-medium text-gray-200">{activeConversation.conversation.title}</span>
          </div>
        )}
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={checkIfAtBottom}>
        <div className="max-w-4xl mx-auto px-4 pt-4 space-y-4 pb-10">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} typing={msg.id === typingMsgId} onTypingTick={msg.id === typingMsgId ? handleTypingTick : undefined} onTypingDone={msg.id === typingMsgId ? () => setTypingMsgId(null) : undefined} />
          ))}
          {pendingUserMsg && (
            <MessageBubble
              message={{
                id: -1,
                conversation_id: 0,
                role: 'user',
                text: pendingUserMsg.text,
                image_url: pendingUserMsg.imageUrls?.[0] || null,
                message_type: pendingUserMsg.imageUrls ? 'image_input' : 'text',
                image_params: {
                  ...(pendingUserMsg.imageUrls ? { image_urls: pendingUserMsg.imageUrls } : {}),
                  ...(pendingUserMsg.documents ? { documents: pendingUserMsg.documents.map(d => ({ url: d.url, name: d.original_name, thumbnail_url: d.thumbnail_url, page_count: d.page_count })) } : {}),
                },
                created_at: new Date().toISOString(),
              }}
            />
          )}
          {sending && (
            <div className="flex items-center gap-1.5 py-2">
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {error && <div className="max-w-4xl mx-auto px-4 py-2 text-sm text-red-400 bg-red-900/30">{error}</div>}
      </div>
      {/* 입력바 — 스크롤 영역 밖, 하단 고정, 메시지와 살짝 겹침 */}
      {isOwner && (
        <div className="-mt-4 relative z-10 max-w-4xl mx-auto w-full" style={{ background: 'linear-gradient(to bottom, transparent 50%, #212121 50%)' }}>
          <ChatInput onSend={handleSend} disabled={sending} droppedFiles={droppedFiles} rightElement={
            <ModelSelector value={selectedProvider?.id ?? null} modelOverride={modelOverride} onChange={handleModelChange} compact />
          } />
        </div>
      )}
    </div>
  );
}
