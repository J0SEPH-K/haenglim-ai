import { useEffect, useState } from 'react';
import {
  getIpAllowlist,
  updateIpRestrictionEnabled,
  createIpAllowlistEntry,
  updateIpAllowlistEntry,
  deleteIpAllowlistEntry,
  type IPAllowlistEntry,
  type IPAllowlistResponse,
} from '../../api/admin';
import { Plus, Edit2, Trash2, X, Shield, AlertTriangle, Copy } from 'lucide-react';

export default function IPAllowlistPage() {
  const [data, setData] = useState<IPAllowlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IPAllowlistEntry | null>(null);
  const [form, setForm] = useState({ cidr: '', label: '', enabled: true });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getIpAllowlist());
    } catch (e: any) {
      setError(e?.response?.data?.detail || '데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ cidr: '', label: '', enabled: true });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (e: IPAllowlistEntry) => {
    setEditing(e);
    setForm({ cidr: e.cidr, label: e.label || '', enabled: e.enabled });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateIpAllowlistEntry(editing.id, {
          cidr: form.cidr,
          label: form.label || null,
          enabled: form.enabled,
        });
      } else {
        await createIpAllowlistEntry({
          cidr: form.cidr,
          label: form.label || null,
          enabled: form.enabled,
        });
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || '저장에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    await deleteIpAllowlistEntry(id);
    load();
  };

  const handleToggleEnabled = async (entry: IPAllowlistEntry) => {
    await updateIpAllowlistEntry(entry.id, { enabled: !entry.enabled });
    load();
  };

  const handleToggleRestriction = async (next: boolean) => {
    if (!data) return;
    // Warn before turning ON when there are no enabled entries
    if (next && data.entries.filter((e) => e.enabled).length === 0) {
      const ok = confirm('허용 IP가 한 개도 없는 상태에서 IP 제한을 켜면 모든 사용자가 차단됩니다. 계속할까요?');
      if (!ok) return;
    }
    await updateIpRestrictionEnabled(next);
    load();
  };

  const copyMyIp = async () => {
    if (data?.your_ip) await navigator.clipboard.writeText(`${data.your_ip}/32`);
  };

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">불러오는 중...</div>;
  if (error) return <div className="text-red-400 text-sm py-8 text-center">{error}</div>;
  if (!data) return null;

  const enabled = data.settings.ip_restriction_enabled;
  const enabledEntries = data.entries.filter((e) => e.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">IP 제한</h2>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
          <Plus className="w-4 h-4" /> CIDR 추가
        </button>
      </div>

      {/* Master toggle + status */}
      <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className={`w-5 h-5 mt-0.5 ${enabled ? 'text-emerald-400' : 'text-gray-500'}`} />
            <div>
              <div className="text-white text-sm font-semibold">
                {enabled ? 'IP 제한 활성화' : 'IP 제한 비활성화'}
              </div>
              <div className="text-gray-500 text-xs mt-1">
                {enabled
                  ? `허용된 ${enabledEntries}개의 CIDR에 속한 IP에서만 접속할 수 있습니다. 관리자(/api/admin) 경로는 항상 접근 가능합니다.`
                  : '모든 IP에서 접속할 수 있습니다.'}
              </div>
            </div>
          </div>
          <label className="inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggleRestriction(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#3a3a3a] rounded-full peer peer-checked:bg-emerald-600 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
        </div>

        {data.your_ip && (
          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="text-gray-500">현재 접속 IP:</span>
            <code className="px-2 py-1 bg-[#2f2f2f] rounded text-gray-200">{data.your_ip}</code>
            <button
              onClick={copyMyIp}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300"
              title={`${data.your_ip}/32 복사`}
            >
              <Copy className="w-3.5 h-3.5" /> /32 복사
            </button>
          </div>
        )}

        {enabled && enabledEntries === 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-yellow-500 bg-yellow-900/20 border border-yellow-900/40 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>허용된 CIDR이 없습니다. 일반 사용자는 모두 차단됩니다.</div>
          </div>
        )}
      </section>

      {/* Allowlist table */}
      <section className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4">
        <div className="mb-3">
          <h3 className="text-white text-sm font-semibold">허용 CIDR 목록</h3>
          <p className="text-gray-500 text-xs mt-0.5">예: <code className="text-gray-400">203.0.113.0/24</code> (서브넷), <code className="text-gray-400">203.0.113.5/32</code> (단일 IP), <code className="text-gray-400">2001:db8::/32</code> (IPv6).</p>
        </div>
        {data.entries.length === 0 ? (
          <div className="text-gray-500 text-sm py-8 text-center">등록된 항목이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2f2f2f] text-left text-gray-500">
                <th className="py-3 font-medium">CIDR</th>
                <th className="py-3 font-medium">설명</th>
                <th className="py-3 font-medium">활성</th>
                <th className="py-3 font-medium">생성일</th>
                <th className="py-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-[#2f2f2f]">
                  <td className="py-3"><code className="text-gray-200 font-medium">{e.cidr}</code></td>
                  <td className="py-3 text-gray-400">{e.label || '—'}</td>
                  <td className="py-3">
                    <button onClick={() => handleToggleEnabled(e)}>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.enabled ? 'bg-green-900/40 text-green-400' : 'bg-[#2f2f2f] text-gray-500'}`}>
                        {e.enabled ? '활성' : '비활성'}
                      </span>
                    </button>
                  </td>
                  <td className="py-3 text-gray-500">{new Date(e.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
                  <td className="py-3 flex gap-1">
                    <button onClick={() => openEdit(e)} className="p-1.5 text-gray-500 hover:text-blue-400"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(e.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{editing ? 'CIDR 수정' : 'CIDR 추가'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="CIDR (예: 203.0.113.0/24, 또는 단일 IP는 /32)"
                value={form.cidr}
                onChange={(e) => setForm({ ...form, cidr: e.target.value })}
                required
                autoFocus
                className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500 font-mono"
              />
              <input
                type="text"
                placeholder="설명 (선택, 예: 본사 사무실)"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500"
              />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
                활성화
              </label>
              {formError && <div className="text-red-400 text-xs">{formError}</div>}
              <button type="submit" disabled={submitting} className="w-full py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium disabled:opacity-50">
                {submitting ? '저장 중...' : (editing ? '수정' : '생성')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
