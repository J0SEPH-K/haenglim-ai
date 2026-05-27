import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/chat');
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#212121]">
      <div className="w-full max-w-md px-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <h1 className="text-3xl font-bold text-white">HAENGLIM AI</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/30 rounded-lg">{error}</div>
          )}
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-full text-white placeholder-gray-500 focus:ring-2 focus:ring-white/20 focus:border-transparent outline-none"
              placeholder="이메일을 입력해주세요"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-full text-white placeholder-gray-500 focus:ring-2 focus:ring-white/20 focus:border-transparent outline-none"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-2 px-4 bg-white text-black rounded-full hover:bg-gray-200 disabled:opacity-50 font-medium"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
