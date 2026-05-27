import { useEffect, useState, useRef } from 'react';
import { listAvailableProviders } from '../../api/providers';
import type { AIProvider } from '../../types';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { getCuratedModels } from '../../utils/curatedModels';

interface Props {
  value: number | null;
  modelOverride?: string | null;
  onChange: (provider: AIProvider, modelId?: string) => void;
  compact?: boolean;
  // Which curated model list to show when the user expands a provider.
  // Defaults to "chat" since that's the most common caller.
  mode?: 'chat' | 'image';
}

export default function ModelSelector({ value, modelOverride, onChange, compact, mode = 'chat' }: Props) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [open, setOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAvailableProviders().then((list) => {
      setProviders(list);
      if (!value && list.length > 0) {
        onChange(list[0]);
      }
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setExpandedProvider(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = providers.find((p) => p.id === value);
  // Admins don't pick a default model anymore, so we ignore selected.model_id (it may be stale
  // legacy data from before the refactor) and just show the user's picked variant or "자동".
  const displayModel = modelOverride || '자동';

  const handleSelectProvider = (p: AIProvider) => {
    onChange(p);
    setOpen(false);
    setExpandedProvider(null);
  };

  const handleSelectVariant = (p: AIProvider, modelId: string) => {
    onChange(p, modelId);
    setOpen(false);
    setExpandedProvider(null);
  };

  const handleToggleExpand = (e: React.MouseEvent, providerId: number) => {
    e.stopPropagation();
    setExpandedProvider((prev) => (prev === providerId ? null : providerId));
  };

  const renderProviderItem = (p: AIProvider) => {
    const isSelected = value === p.id;
    const isExpanded = expandedProvider === p.id;
    // Curated broad-family list per provider type. Previously we fetched every
    // model the provider's API exposes; that surfaced deprecated/irrelevant
    // entries (babbage-002, davinci-002, etc.) and defeated the point of
    // hiding model picking from the admin.
    const variants = getCuratedModels(p.provider_type, mode);

    return (
      <div key={p.id}>
        <div className="flex items-center hover:bg-[#3a3a3a] transition-colors">
          <button
            type="button"
            onClick={() => handleSelectProvider(p)}
            className="flex-1 flex items-center justify-between px-3 py-2.5 text-left"
          >
            <div>
              <div className="text-sm text-gray-200">{p.name}</div>
              <div className="text-xs text-gray-500">{isSelected && modelOverride ? modelOverride : '자동 선택'}</div>
            </div>
            {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
          </button>
          {variants.length > 0 && (
            <button
              type="button"
              onClick={(e) => handleToggleExpand(e, p.id)}
              className="px-2 py-2.5 text-gray-500 hover:text-gray-300 shrink-0"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        {isExpanded && variants.length > 0 && (
          <div className="bg-[#262626]">
            {variants.map((m) => {
              const isVariantSelected = isSelected && modelOverride === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectVariant(p, m.id)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-left hover:bg-[#333] transition-colors"
                >
                  <span className="text-xs text-gray-300 truncate">{m.name}</span>
                  {isVariantSelected && <Check className="w-3 h-3 text-blue-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (compact) {
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 pl-3 pr-2.5 py-1 text-xs text-gray-400 bg-[#424242] rounded-full cursor-pointer hover:bg-[#4a4a4a] transition-colors"
        >
          <span>{selected ? selected.name : '모델'}</span>
          <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute bottom-full mb-2 right-0 min-w-[260px] bg-[#2f2f2f] border border-[#424242] rounded-xl shadow-xl overflow-hidden z-50">
            {providers.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">사용 가능한 모델이 없습니다</div>
            )}
            {providers.map((p) => renderProviderItem(p))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm bg-[#2f2f2f] text-gray-300 cursor-pointer hover:bg-[#3a3a3a] transition-colors"
      >
        <span className="truncate">{selected ? `${selected.name} (${displayModel})` : '모델을 선택하세요...'}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-full bg-[#2f2f2f] border border-[#424242] rounded-xl shadow-xl overflow-hidden z-50">
          {providers.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">사용 가능한 모델이 없습니다</div>
          )}
          {providers.map((p) => renderProviderItem(p))}
        </div>
      )}
    </div>
  );
}
