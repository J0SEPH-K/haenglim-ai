import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { changePassword } from '../api/auth';
import { ArrowLeft, Check } from 'lucide-react';

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 6) {
      setError('새 비밀번호는 6자 이상이어야 합니다');
      return;
    }
    if (next !== confirm) {
      setError('새 비밀번호와 확인이 일치하지 않습니다');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || '비밀번호 변경에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#212121]">
      <header className="h-14 border-b border-[#2f2f2f] bg-[#171717] flex items-center px-4 gap-4 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
          title="뒤로"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-white">설정</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto space-y-6">
          {/* Account info */}
          <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
            <h2 className="text-white text-sm font-semibold mb-3">계정 정보</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">이름</span>
                <span className="text-gray-200">{user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">이메일</span>
                <span className="text-gray-200">{user?.email}</span>
              </div>
              {user?.group_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">그룹</span>
                  <span className="text-gray-200">{user.group_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">역할</span>
                <span className="text-gray-200">{user?.role === 'admin' ? '관리자' : '사용자'}</span>
              </div>
            </div>
          </section>

          {/* Password change */}
          <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
            <h2 className="text-white text-sm font-semibold mb-3">비밀번호 변경</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">현재 비밀번호</label>
                <input
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2 bg-[#2f2f2f] border border-[#3a3a3a] rounded-lg text-sm text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">새 비밀번호</label>
                <input
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-[#2f2f2f] border border-[#3a3a3a] rounded-lg text-sm text-white placeholder-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">6자 이상</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-[#2f2f2f] border border-[#3a3a3a] rounded-lg text-sm text-white placeholder-gray-500"
                />
              </div>

              {error && (
                <div className="text-red-400 text-xs bg-red-900/20 border border-red-900/40 rounded px-3 py-2">{error}</div>
              )}
              {success && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-900/40 rounded px-3 py-2">
                  <Check className="w-4 h-4" /> 비밀번호가 변경되었습니다
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
