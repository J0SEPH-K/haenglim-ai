import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Users, FolderTree, Cpu, ArrowLeft, LayoutDashboard, Shield } from 'lucide-react';

export default function AdminLayout() {
  const navigate = useNavigate();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg ${
      isActive ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
    }`;

  return (
    <div className="h-screen flex flex-col bg-[#212121]">
      <header className="h-14 border-b border-[#2f2f2f] bg-[#171717] flex items-center px-4 gap-4 shrink-0">
        <button
          onClick={() => navigate('/chat')}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-white">관리자 패널</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-56 border-r border-[#2f2f2f] bg-[#171717] p-3 space-y-1">
          <NavLink to="/admin/dashboard" className={linkClass}>
            <LayoutDashboard className="w-4 h-4" /> 대시보드
          </NavLink>
          <NavLink to="/admin/users" className={linkClass}>
            <Users className="w-4 h-4" /> 사용자
          </NavLink>
          <NavLink to="/admin/groups" className={linkClass}>
            <FolderTree className="w-4 h-4" /> 그룹
          </NavLink>
          <NavLink to="/admin/providers" className={linkClass}>
            <Cpu className="w-4 h-4" /> AI 제공업체
          </NavLink>
          <NavLink to="/admin/ip-allowlist" className={linkClass}>
            <Shield className="w-4 h-4" /> IP 제한
          </NavLink>
        </nav>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
