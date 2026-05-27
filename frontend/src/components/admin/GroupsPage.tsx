import { Fragment, useEffect, useMemo, useState } from 'react';
import { listGroups, createGroup, updateGroup, deleteGroup, listUsers, updateUser } from '../../api/admin';
import type { Group, User } from '../../types';
import { Plus, Edit2, Trash2, X, UserPlus, ArrowRightLeft, ChevronRight, Search } from 'lucide-react';

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [tokenLimit, setTokenLimit] = useState('');
  const [priceLimit, setPriceLimit] = useState('');

  const [detail, setDetail] = useState<Group | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [movingUserId, setMovingUserId] = useState<number | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState('');

  const load = async () => setGroups(await listGroups());
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setTokenLimit('');
    setPriceLimit('');
    setShowForm(true);
  };
  const openEdit = (g: Group) => {
    setEditing(g);
    setName(g.name);
    setTokenLimit(g.token_limit != null ? String(g.token_limit) : '');
    setPriceLimit(g.price_limit_usd != null ? String(g.price_limit_usd) : '');
    setShowForm(true);
  };

  const loadAllUsers = async () => {
    setUsersLoading(true);
    try {
      setAllUsers(await listUsers());
    } finally {
      setUsersLoading(false);
    }
  };

  const openDetail = async (g: Group) => {
    setDetail(g);
    setShowAddExisting(false);
    setMovingUserId(null);
    setActionError(null);
    setAddSearch('');
    setAllUsers([]);
    await loadAllUsers();
  };

  const closeDetail = () => {
    setDetail(null);
    setShowAddExisting(false);
    setMovingUserId(null);
    setActionError(null);
    setAddSearch('');
  };

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
      const data: { name?: string; token_limit?: number | null; price_limit_usd?: number | null } = { name };
      const tl = parseLimitForUpdate(tokenLimit, 'int');
      if (tl !== undefined) data.token_limit = tl;
      const pl = parseLimitForUpdate(priceLimit, 'float');
      if (pl !== undefined) data.price_limit_usd = pl;
      await updateGroup(editing.id, data);
    } else {
      const extras: { token_limit?: number | null; price_limit_usd?: number | null } = {};
      const tl = parseLimitForCreate(tokenLimit, 'int');
      if (tl !== undefined) extras.token_limit = tl;
      const pl = parseLimitForCreate(priceLimit, 'float');
      if (pl !== undefined) extras.price_limit_usd = pl;
      await createGroup(name, extras);
    }
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 그룹을 삭제하시겠습니까?')) return;
    try { await deleteGroup(id); load(); } catch { alert('사용자가 있는 그룹은 삭제할 수 없습니다'); }
  };

  const moveUserToGroup = async (userId: number, groupId: number) => {
    setBusyUserId(userId);
    setActionError(null);
    try {
      await updateUser(userId, { group_id: groupId });
      await Promise.all([loadAllUsers(), load()]);
      setMovingUserId(null);
      setShowAddExisting(false);
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || '작업에 실패했습니다');
    } finally {
      setBusyUserId(null);
    }
  };

  const members = useMemo(
    () => (detail ? allUsers.filter((u) => u.group_id === detail.id) : []),
    [allUsers, detail]
  );
  const available = useMemo(
    () => (detail ? allUsers.filter((u) => u.group_id !== detail.id && u.is_active) : []),
    [allUsers, detail]
  );
  const filteredAvailable = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return [...available].sort((a, b) => a.name.localeCompare(b.name));
    const scored = available
      .map((u) => {
        const name = u.name.toLowerCase();
        const email = u.email.toLowerCase();
        let score = -1;
        if (name.startsWith(q) || email.startsWith(q)) score = 0;
        else if (name.includes(q) || email.includes(q)) score = 1;
        return { u, score };
      })
      .filter((x) => x.score >= 0);
    scored.sort((a, b) => a.score - b.score || a.u.name.localeCompare(b.u.name));
    return scored.map((x) => x.u);
  }, [available, addSearch]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">그룹</h2>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
          <Plus className="w-4 h-4" /> 그룹 추가
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2f2f2f] text-left text-gray-500">
            <th className="py-3 font-medium">이름</th>
            <th className="py-3 font-medium">멤버 수</th>
            <th className="py-3 font-medium">생성일</th>
            <th className="py-3 font-medium">작업</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.id}
              onClick={() => openDetail(g)}
              className="border-b border-[#2f2f2f] cursor-pointer hover:bg-[#2f2f2f]/40"
            >
              <td className="py-3 text-gray-200 font-medium">{g.name}</td>
              <td className="py-3 text-gray-400">{g.user_count}</td>
              <td className="py-3 text-gray-500">{new Date(g.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
              <td className="py-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEdit(g)} className="p-1.5 text-gray-500 hover:text-blue-400"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(g.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{editing ? '그룹 수정' : '그룹 생성'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="그룹 이름" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              <div className="pt-2 border-t border-[#4a4a4a]/60">
                <div className="text-xs font-medium text-gray-400 mb-2">그룹 한도 (선택, 비워두면 무제한)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" placeholder="토큰 한도" value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value)} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
                  <input type="number" min="0" step="0.01" placeholder="가격 한도 (USD)" value={priceLimit} onChange={(e) => setPriceLimit(e.target.value)} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
                </div>
              </div>
              <button type="submit" className="w-full py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
                {editing ? '수정' : '생성'}
              </button>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={closeDetail}>
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{detail.name}</h3>
              <button onClick={closeDetail} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <div className="text-gray-500 text-xs mb-1">멤버 수</div>
                <div className="text-gray-200">{members.length}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs mb-1">생성일</div>
                <div className="text-gray-200">{new Date(detail.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
              </div>
            </div>

            {actionError && (
              <div className="mb-3 text-red-400 text-xs bg-red-900/20 border border-red-900/40 rounded px-3 py-2">{actionError}</div>
            )}

            <div className="flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-gray-400 text-xs">사용자 목록</div>
                <button
                  onClick={() => { setShowAddExisting((v) => !v); setMovingUserId(null); setActionError(null); setAddSearch(''); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#3a3a3a] text-gray-200 rounded-md hover:bg-[#4a4a4a] text-xs font-medium"
                >
                  {showAddExisting ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {showAddExisting ? '닫기' : '기존 사용자 추가'}
                </button>
              </div>

              {showAddExisting && (
                <div className="mb-4 p-3 bg-[#262626] rounded-lg">
                  <div className="text-gray-400 text-xs mb-2">다른 그룹 또는 미지정 사용자를 이 그룹으로 이동합니다</div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                      type="text"
                      autoFocus
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="이름 또는 이메일 검색"
                      className="w-full pl-8 pr-8 py-1.5 bg-[#3a3a3a] border border-[#4a4a4a] rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#5a5a5a]"
                    />
                    {addSearch && (
                      <button
                        onClick={() => setAddSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {usersLoading ? (
                    <div className="text-gray-500 text-sm py-4 text-center">불러오는 중...</div>
                  ) : available.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">추가할 수 있는 사용자가 없습니다</div>
                  ) : filteredAvailable.length === 0 ? (
                    <div className="text-gray-500 text-sm py-4 text-center">검색 결과가 없습니다</div>
                  ) : (
                    <div className="max-h-56 overflow-auto divide-y divide-[#3a3a3a]">
                      {filteredAvailable.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => moveUserToGroup(u.id, detail.id)}
                          disabled={busyUserId === u.id}
                          className="w-full flex items-center justify-between py-2 px-2 text-left hover:bg-[#3a3a3a] rounded disabled:opacity-50"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-200 font-medium">{u.name}</span>
                            <span className="text-xs text-gray-500">{u.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{u.group_name || '그룹 없음'}</span>
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {usersLoading ? (
                <div className="text-gray-500 text-sm py-4 text-center">불러오는 중...</div>
              ) : members.length === 0 ? (
                <div className="text-gray-500 text-sm py-4 text-center">이 그룹에 사용자가 없습니다</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3a3a3a] text-left text-gray-500">
                      <th className="py-2 font-medium">이름</th>
                      <th className="py-2 font-medium">이메일</th>
                      <th className="py-2 font-medium">역할</th>
                      <th className="py-2 font-medium">상태</th>
                      <th className="py-2 font-medium">이동</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((u) => (
                      <Fragment key={u.id}>
                        <tr
                          onClick={() => { setMovingUserId(movingUserId === u.id ? null : u.id); setActionError(null); }}
                          className="border-b border-[#3a3a3a] cursor-pointer hover:bg-[#3a3a3a]/40"
                        >
                          <td className="py-2 text-gray-200 font-medium">{u.name}</td>
                          <td className="py-2 text-gray-400">{u.email}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-900/40 text-purple-300' : 'bg-[#3a3a3a] text-gray-400'}`}>
                              {u.role === 'admin' ? '관리자' : '사용자'}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                              {u.is_active ? '활성' : '비활성'}
                            </span>
                          </td>
                          <td className="py-2 text-gray-500">
                            <ArrowRightLeft className="w-4 h-4" />
                          </td>
                        </tr>
                        {movingUserId === u.id && (
                          <tr className="border-b border-[#3a3a3a] bg-[#262626]">
                            <td colSpan={5} className="py-3 px-2">
                              <div className="text-gray-400 text-xs mb-2">{u.name}을(를) 이동할 그룹 선택</div>
                              <div className="flex flex-wrap gap-2">
                                {groups.filter((g) => g.id !== detail.id).length === 0 ? (
                                  <span className="text-gray-500 text-xs">다른 그룹이 없습니다</span>
                                ) : (
                                  groups.filter((g) => g.id !== detail.id).map((g) => (
                                    <button
                                      key={g.id}
                                      onClick={() => moveUserToGroup(u.id, g.id)}
                                      disabled={busyUserId === u.id}
                                      className="px-3 py-1.5 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-200 text-xs rounded-md disabled:opacity-50"
                                    >
                                      {g.name}
                                    </button>
                                  ))
                                )}
                                <button
                                  onClick={() => setMovingUserId(null)}
                                  className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-xs"
                                >
                                  취소
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
