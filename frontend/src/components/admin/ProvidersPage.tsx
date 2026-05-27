import { useEffect, useState } from 'react';
import { listProviders, createProvider, updateProvider, deleteProvider } from '../../api/admin';
import type { AIProviderFull } from '../../types';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<AIProviderFull[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AIProviderFull | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider_type: 'openai',
    api_key: '',
    enabled: true,
    token_quota: '',
    input_price_per_1m: '',
    output_price_per_1m: '',
  });

  const load = async () => setProviders(await listProviders());
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', provider_type: 'openai', api_key: '', enabled: true, token_quota: '', input_price_per_1m: '', output_price_per_1m: '' });
    setShowForm(true);
  };
  const openEdit = (p: AIProviderFull) => {
    setEditing(p);
    setForm({
      name: p.name,
      provider_type: p.provider_type,
      api_key: '',
      enabled: p.enabled,
      token_quota: p.token_quota != null ? String(p.token_quota) : '',
      input_price_per_1m: p.input_price_per_1m != null ? String(p.input_price_per_1m) : '',
      output_price_per_1m: p.output_price_per_1m != null ? String(p.output_price_per_1m) : '',
    });
    setShowForm(true);
  };

  const parseOptionalInt = (s: string): number | null | undefined => {
    const t = s.trim();
    if (t === '') return null; // empty clears / unlimited
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const parseOptionalFloat = (s: string): number | null | undefined => {
    const t = s.trim();
    if (t === '') return -1; // sentinel for "clear override" — backend treats <0 as null
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const data: {
        name: string;
        enabled: boolean;
        api_key?: string;
        token_quota?: number | null;
        input_price_per_1m?: number | null;
        output_price_per_1m?: number | null;
      } = { name: form.name, enabled: form.enabled };
      if (form.api_key) data.api_key = form.api_key;
      const tq = parseOptionalInt(form.token_quota);
      if (tq !== undefined) data.token_quota = tq ?? 0; // 0 → backend stores NULL (unlimited)
      const ip = parseOptionalFloat(form.input_price_per_1m);
      if (ip !== undefined) data.input_price_per_1m = ip;
      const op = parseOptionalFloat(form.output_price_per_1m);
      if (op !== undefined) data.output_price_per_1m = op;
      await updateProvider(editing.id, data);
    } else {
      const createData: any = {
        name: form.name,
        provider_type: form.provider_type,
        api_key: form.api_key,
        enabled: form.enabled,
      };
      const tq = parseOptionalInt(form.token_quota);
      if (tq !== undefined && tq !== null) createData.token_quota = tq;
      const ip = parseOptionalFloat(form.input_price_per_1m);
      if (ip !== undefined && ip !== -1) createData.input_price_per_1m = ip;
      const op = parseOptionalFloat(form.output_price_per_1m);
      if (op !== undefined && op !== -1) createData.output_price_per_1m = op;
      await createProvider(createData);
    }
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 제공업체를 삭제하시겠습니까?')) return;
    await deleteProvider(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">AI 제공업체</h2>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-[#2f2f2f] text-gray-200 rounded-lg hover:bg-[#3a3a3a] text-sm font-medium">
          <Plus className="w-4 h-4" /> 제공업체 추가
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2f2f2f] text-left text-gray-500">
            <th className="py-3 font-medium">이름</th>
            <th className="py-3 font-medium">유형</th>
            <th className="py-3 font-medium">상태</th>
            <th className="py-3 font-medium">작업</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id} className="border-b border-[#2f2f2f]">
              <td className="py-3 text-gray-200 font-medium">{p.name}</td>
              <td className="py-3">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#2f2f2f] text-gray-400">{p.provider_type}</span>
              </td>
              <td className="py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.enabled ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                  {p.enabled ? '활성' : '비활성'}
                </span>
              </td>
              <td className="py-3 flex gap-1">
                <button onClick={() => openEdit(p)} className="p-1.5 text-gray-500 hover:text-blue-400"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#2f2f2f] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{editing ? '제공업체 수정' : '제공업체 추가'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="text" placeholder="표시 이름 (예: OpenAI)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              {!editing && (
                <select value={form.provider_type} onChange={(e) => setForm({ ...form, provider_type: e.target.value })} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-gray-300">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                </select>
              )}
              <input type="password" placeholder={editing ? 'API 키 (변경하지 않으려면 비워두세요)' : 'API 키'} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required={!editing} className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500" />
              <p className="text-xs text-gray-500">
                사용자가 채팅 시 모델을 직접 선택합니다. 웹 검색이 필요한 질문은 자동으로 적합한 모델로 라우팅됩니다.
              </p>

              <div className="pt-2 border-t border-[#4a4a4a]/60">
                <div className="text-xs font-medium text-gray-400 mb-2">쿼터 및 가격 (선택)</div>
                <input
                  type="number"
                  min="0"
                  placeholder="토큰 쿼터 (비우면 무제한)"
                  value={form.token_quota}
                  onChange={(e) => setForm({ ...form, token_quota: e.target.value })}
                  className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500 mb-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="입력 $/1M (기본값 사용하려면 비움)"
                    value={form.input_price_per_1m}
                    onChange={(e) => setForm({ ...form, input_price_per_1m: e.target.value })}
                    className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="출력 $/1M (기본값 사용하려면 비움)"
                    value={form.output_price_per_1m}
                    onChange={(e) => setForm({ ...form, output_price_per_1m: e.target.value })}
                    className="w-full px-3 py-2 bg-[#3a3a3a] border border-[#4a4a4a] rounded-lg text-sm text-white placeholder-gray-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  비워두면 내장 가격표를 사용하고, 값을 입력하면 해당 제공업체에 한해 덮어씁니다.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
                활성화
              </label>
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
