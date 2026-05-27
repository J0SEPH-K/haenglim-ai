import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';

export default function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-[#171717] flex items-center justify-between px-4 shrink-0">
      <span className="text-lg font-bold text-white ml-[5px]">HAENGLIM AI</span>
      <div className="flex items-center gap-3">
        {user?.role === 'admin' && (
          <button
            onClick={() => navigate('/admin/users')}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
            title="관리자"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => navigate('/settings')}
          className="text-sm text-gray-400 hover:text-white"
          title="설정"
        >
          {user?.name}
        </button>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
          title="로그아웃"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
