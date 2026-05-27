import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConversationStore } from '../../stores/conversationStore';
import { Plus, MessageCircle, Image, Trash2 } from 'lucide-react';
import type { Conversation } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useResizable } from '../../hooks/useResizable';

export default function Sidebar() {
  const { width, startResize } = useResizable({
    defaultWidth: 288,
    minWidth: 200,
    maxWidth: 480,
    storageKey: 'sidebar-width',
  });
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { conversations, groupConversations, fetchConversations, fetchGroupConversations, deleteConversation } =
    useConversationStore();

  useEffect(() => {
    fetchConversations();
    fetchGroupConversations();
  }, []);

  const currentMode = location.pathname.startsWith('/image') ? 'image' : 'chat';

  const allConvs = [...conversations, ...groupConversations]
    .filter((c) => c.mode === currentMode)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const handleNew = () => {
    navigate(currentMode === 'image' ? '/image' : '/chat');
  };

  const handleSelect = (conv: Conversation) => {
    const isOwn = conv.user_id === user?.id;
    const prefix = conv.mode === 'image' ? '/image' : '/chat';
    if (isOwn) {
      navigate(`${prefix}/${conv.id}`);
    } else {
      navigate(`/group/${conv.id}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await deleteConversation(id);
    navigate(currentMode === 'image' ? '/image' : '/chat');
  };

  return (
    <aside className="relative bg-[#1a1a1a] flex flex-col shrink-0" style={{ width }}>
      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
      />
      {/* 모드 전환 */}
      <div className="p-3">
        <div className="flex rounded-full bg-[#2f2f2f] overflow-hidden h-9">
          <button
            onClick={() => navigate('/chat')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-l-full font-medium transition-all ${
              currentMode === 'chat' ? 'flex-[6] bg-[#424242] text-white shadow-sm text-sm' : 'flex-[4] text-gray-500 text-xs'
            }`}
          >
            <MessageCircle className="w-4 h-4" /> 채팅
          </button>
          <button
            onClick={() => navigate('/image')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-r-full font-medium transition-all ${
              currentMode === 'image' ? 'flex-[6] bg-[#424242] text-white shadow-sm text-sm' : 'flex-[4] text-gray-500 text-xs'
            }`}
          >
            <Image className="w-4 h-4" /> 이미지
          </button>
        </div>
      </div>

      {/* 새 대화 버튼 */}
      <div className="p-3">
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-2 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> {currentMode === 'image' ? '새로운 이미지 생성' : '새로운 대화'}
        </button>
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto">
        {allConvs.length === 0 && (
          <p className="p-4 text-sm text-gray-600 text-center">대화가 없습니다</p>
        )}
        {allConvs.map((conv) => {
          const isOwn = conv.user_id === user?.id;
          return (
            <div
              key={`${isOwn ? 'own' : 'group'}-${conv.id}`}
              onClick={() => handleSelect(conv)}
              className="mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[#2f2f2f] group flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-200 truncate">{conv.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {!isOwn && <span>{conv.user_name} · </span>}
                  {conv.ai_provider?.name}
                </p>
              </div>
              {isOwn && (
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
