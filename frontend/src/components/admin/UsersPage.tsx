import { useEffect, useState } from 'react';
import { listUsers, createUser, updateUser, deleteUser, bulkCreateUsersCsv, type BulkCsvResult } from '../../api/admin';
import { listGroups } from '../../api/admin';
import type { User, Group } from '../../types';
import { Plus, Edit2, Trash2, X, Upload } from 'lucide-react';

const emptyForm = { email: '', password: '', name: '', role: 'user', group_id: '', token_limit: '', price_limit_usd: '' };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCsv, setShowCsv] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<BulkCsvResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const load = async () => {
    const [u, g] = await Promise.all([listUsers(), listGroups()]);
    setUsers(u);
    setGroups(g);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      email: u.email,
      password: '',
      name: u.name,
      role: u.role,
      group_id: u.group_id?.toString() || '',
      token_limit: u.token_limit != null ? String(u.token_limit) : '',
      price_limit_usd: u.price_limit_usd != null ? String(u.price_limit_usd) : '',
    });
    setShowForm(true);
  };

  // Empty input → -1 sentinel (backend treats <0 as NULL i.e. clear). Empty on create = no limit.
  const parseLimitForUpdate = (s: string, kind: 'int' | 'float'): number | undefined => {
    const t = s.trim();
    if (t === '') return -1;
    const n = kind === 'int' ? parseInt(t, 10) : parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const parseLimitForCreate = (s: string, kind: 'int' | 'float'): number | undefined => {
    const t = s.trim();
    if (t === '') return undefined;
    const n = kind === 'int' ? parseInt(t, 10) : parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const data: any = { name: form.name, role: form.role };
      if (form.password) data.password = form.password;
      if (form.group_id) data.group_id = Number(form.group_id);
      const tl = parseLimitForUpdate(form.token_limit, 'int');
      if (tl !== undefined) data.token_limit = tl;
      const pl = parseLimitForUpdate(form.price_limit_usd, 'float');
      if (pl !== undefined) data.price_limit_usd = pl;
      await updateUser(editing.id, data);
    } else {
      const data: any = {
        email: form.email,
        password: form.password,
        name: form.name,
        role: form.role,
        group_id: form.group_id ? Number(form.group_id) : undefined,
      };
      const tl = parseLimitForCreate(form.token_limit, 'int');
      if (tl !== undefined) data.token_limit = tl;
      const pl = parseLimitForCreate(form.price_limit_usd, 'float');
      if (pl !== undefined) data.price_limit_usd = pl;
      await createUser(data);
    }
    setShowForm(false);
    load();
  };

  const openCsv = () => {
    setCsvFile(null);
    setCsvResult(null);
    setCsvError(null);
    setShowCsv(true);
  };

  const handleCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setCsvBusy(true);
    setCsvError(null);
    try {
      const r = await bulkCreateUsersCsv(csvFile);
      setCsvResult(r);
      load();
    } catch (err: any) {
      setCsvError(err?.response?.data?.detail || 'CSV 처리에 실패했습니다');
    } finally {
      setCsvBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 사용자를 비활성화하시겠습니까?')) return;
    await deleteUser(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">사용자</h2>
        <div className="flex items-center gap-2">
          <button onClick={openCsv} className="flex items-center gap-2 px-4 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
            <Upload className="w-4 h-4" /> CSV 업로드
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
            <Plus className="w-4 h-4" /> 사용자 추가
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2f2f2f] text-left text-gray-500">
            <th className="py-3 font-medium">이름</th>
            <th className="py-3 font-medium">이메일</th>
            <th className="py-3 font-medium">역할</th>
            <th className="py-3 font-medium">그룹</th>
            <th className="py-3 font-medium">상태</th>
            <th className="py-3 font-medium">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-[#2f2f2f]">
              <td className="py-3 text-gray-200 font-medium">{u.name}</td>
              <td className="py-3 text-gray-400">{u.email}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-900/40 text-purple-300' : 'bg-[#2f2f2f] text-gray-400'}`}>
                  {u.role === 'admin' ? '관리자' : '사용자'}
                </span>
              </td>
              <td className="py-3 text-gray-400">{u.group_name || '—'}</td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                  {u.is_active ? '활성' : '비활성'}
                </span>
              </td>
              <td className="py-3 flex gap-1">
                <button onClick={() => openEdit(u)} className="p-1.5 text-gray-500 hover:text-blue-400">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(u.id)} className="p-1.5 text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCsv && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">CSV로 사용자 일괄 생성</h3>
              <button onClick={() => setShowCsv(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-gray-400 mb-3 leading-relaxed">
              <div className="font-medium text-gray-300 mb-1">CSV 형식 (UTF-8, 첫 행은 헤더):</div>
              <code className="block bg-[#1f1f1f] rounded p-2 text-[11px] text-gray-300 whitespace-pre overflow-x-auto">
                email,name,password,group_name,token_limit,price_limit_usd{'\n'}
                alice@x.com,Alice,pass123,ff,100000,5.00{'\n'}
                bob@x.com,Bob,pass456,,,
              </code>
              <div className="mt-2 text-gray-500">
                필수: <span className="text-gray-300">email, name, password</span>. 선택: <span className="text-gray-300">group_name</span> (기존 그룹 이름이어야 함), <span className="text-gray-300">token_limit</span>, <span className="text-gray-300">price_limit_usd</span>, <span className="text-gray-300">role</span> (user/admin). 빈 값 = 한도 없음.
              </div>
            </div>
            <form onSubmit={handleCsvSubmit} className="space-y-3">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                required
                className="block w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-[#3a3a3a] file:text-gray-200 file:text-xs hover:file:bg-[#4a4a4a]"
              />
              {csvError && <div className="text-red-400 text-xs">{csvError}</div>}
              <button
                type="submit"
                disabled={csvBusy || !csvFile}
                className="w-full py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium disabled:opacity-50"
              >
                {csvBusy ? '처리 중...' : '업로드'}
              </button>
            </form>
            {csvResult && (
              <div className="mt-4 text-xs">
                <div className="text-emerald-400 mb-2">✓ {csvResult.created}명의 사용자를 생성했습니다.</div>
                {csvResult.errors.length > 0 && (
                  <details open className="bg-[#1f1f1f] rounded p-2 max-h-48 overflow-auto">
                    <summary className="text-yellow-400 cursor-pointer">오류 {csvResult.errors.length}건 (행별)</summary>
                    <ul className="mt-2 space-y-1 text-gray-400">
                      {csvResult.errors.map((e, i) => (
                        <li key={i}>
                          <span className="text-gray-500">행 {e.line}</span>{' '}
                          <span className="text-gray-300">{e.email || '(이메일 없음)'}</span>:{' '}
                          <span className="text-red-400">{e.error}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{editing ? '사용자 수정' : '사용자 생성'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!editing && (
                <input type="email" placeholder="이메일" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              )}
              <input type="text" placeholder="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              <input type="password" placeholder={editing ? '새 비밀번호 (변경하지 않으려면 비워두세요)' : '비밀번호'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-gray-300">
                <option value="user">사용자</option>
                <option value="admin">관리자</option>
              </select>
              <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-gray-300">
                <option value="">그룹 없음</option>
                {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>

              <div className="pt-2 border-t border-[#4a4a4a]/60">
                <div className="text-xs font-medium text-gray-400 mb-2">사용자 한도 (선택, 비워두면 무제한)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" placeholder="토큰 한도" value={form.token_limit} onChange={(e) => setForm({ ...form, token_limit: e.target.value })} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
                  <input type="number" min="0" step="0.01" placeholder="가격 한도 (USD)" value={form.price_limit_usd} onChange={(e) => setForm({ ...form, price_limit_usd: e.target.value })} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
                </div>
              </div>

              <button type="submit" className="w-full py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
                {editing ? '수정' : '생성'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
