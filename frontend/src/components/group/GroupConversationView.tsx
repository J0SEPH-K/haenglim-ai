import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useConversationStore } from '../../stores/conversationStore';
import MessageBubble from '../chat/MessageBubble';
import { Eye } from 'lucide-react';

export default function GroupConversationView() {
  const { id } = useParams();
  const { activeConversation, fetchConversation } = useConversationStore();

  useEffect(() => {
    if (id) fetchConversation(Number(id));
  }, [id]);

  if (!activeConversation) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">로딩 중...</div>
    );
  }

  const { conversation, messages } = activeConversation;
  const isImageMode = conversation.mode === 'image';

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-[#2f2f2f] flex items-center gap-2">
        <Eye className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-500">열람 중</span>
        <span className="text-sm font-medium text-gray-200">{conversation.user_name}</span>
        <span className="text-gray-600">·</span>
        <span className="text-sm text-gray-500">{conversation.title}</span>
        <span className="text-gray-600">·</span>
        <span className="text-sm text-gray-500">{conversation.ai_provider?.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isImageMode ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {messages
              .filter((m) => m.image_url && m.role === 'assistant')
              .map((msg) => (
                <img
                  key={msg.id}
                  src={msg.image_url!}
                  alt="생성됨"
                  className="w-full rounded-lg object-cover aspect-square"
                />
              ))}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-[#2f2f2f] p-3 text-center text-sm text-gray-500">
        읽기 전용 — 이 대화는 {conversation.user_name}님의 대화입니다
      </div>
    </div>
  );
}
