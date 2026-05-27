import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConversationStore } from '../../stores/conversationStore';
import { generateImage, editImage } from '../../api/messages';
import { uploadFile } from '../../api/files';
import ModelSelector from '../chat/ModelSelector';
import type { AIProvider, Message } from '../../types';
import { Wand2, Paintbrush, Paperclip, X, ImagePlus, Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import CustomSelect from '../ui/CustomSelect';
import { useResizable } from '../../hooks/useResizable';

function getAspectRatio(size: string): string {
  const [w, h] = size.split('x').map(Number);
  if (!w || !h) return '';
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

export default function ImageView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { width: panelWidth, startResize: startPanelResize } = useResizable({
    defaultWidth: 288,
    minWidth: 220,
    maxWidth: 480,
    storageKey: 'image-panel-width',
  });
  const { activeConversation, fetchConversation, createConversation, addMessages, fetchConversations, clearActive } =
    useConversationStore();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const handleModelChange = (p: AIProvider, modelId?: string) => {
    setSelectedProvider(p);
    setModelOverride(modelId || null);
  };
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [style, setStyle] = useState('vivid');
  const [mode, setMode] = useState<'generate' | 'edit'>('generate');
  const [aiEnhance, setAiEnhance] = useState(true);
  const [variations, setVariations] = useState(1);
  const [sourceImageUrls, setSourceImageUrls] = useState<string[]>([]);
  const MAX_SOURCE_IMAGES = 5;
  const [lightbox, setLightbox] = useState<{ src: string; prompt?: string; enhancedPrompt?: string; createdAt?: string; size?: string; style?: string } | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingGroup, setPendingGroup] = useState<{ prompt: string; count: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (id) {
      fetchConversation(Number(id));
    } else {
      clearActive();
    }
  }, [id]);

  // Initialize selectedProvider from conversation's provider when conversation changes
  useEffect(() => {
    if (activeConversation?.conversation.ai_provider) {
      setSelectedProvider(activeConversation.conversation.ai_provider);
    }
  }, [activeConversation?.conversation.id]);

  const handleUploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      setSourceImageUrls((prev) => {
        if (prev.length >= MAX_SOURCE_IMAGES) return prev;
        return [...prev, res.url];
      });
      setMode((m) => (m === 'generate' ? 'edit' : m));
    } catch {
      alert('파일 업로드에 실패했습니다');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleUploadSource = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await handleUploadImage(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) await handleUploadImage(f);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setLoading(true);
    const currentPrompt = prompt.trim();
    const currentCount = mode === 'edit' ? 1 : variations;
    setPendingGroup({ prompt: currentPrompt, count: currentCount });
    try {
      let convId = activeConversation?.conversation.id;
      if (!convId) {
        if (!selectedProvider) {
          setError('모델을 먼저 선택해주세요');
          setLoading(false);
          setPendingGroup(null);
          return;
        }
        const conv = await createConversation('image', selectedProvider.id);
        convId = conv.id;
        navigate(`/image/${conv.id}`, { replace: true });
        await fetchConversation(conv.id);
      }

      let results: Message[];
      if (mode === 'edit' && sourceImageUrls.length > 0) {
        const r = await editImage(convId, prompt, sourceImageUrls, undefined, aiEnhance);
        results = [r];
      } else {
        const r = await generateImage(convId, prompt, size, style, aiEnhance, variations, selectedProvider?.id, modelOverride);
        results = Array.isArray(r) ? r : [r];
      }
      addMessages(results);
      fetchConversations();
      await fetchConversation(convId);
      setPrompt('');
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : '이미지 생성에 실패했습니다');
    } finally {
      setLoading(false);
      setPendingGroup(null);
    }
  };

  // Group images by generation batch (user prompt → assistant images)
  const allMsgs = activeConversation?.messages || [];
  const imageGroups: { prompt: string; images: typeof allMsgs }[] = [];
  let currentGroup: { prompt: string; images: typeof allMsgs } | null = null;

  for (const msg of allMsgs) {
    if (msg.role === 'user') {
      // Push previous group before starting a new one
      if (currentGroup && currentGroup.images.length > 0) {
        imageGroups.push(currentGroup);
      }
      currentGroup = { prompt: msg.text || '', images: [] };
    } else if (msg.role === 'assistant' && msg.image_url && currentGroup) {
      currentGroup.images.push(msg);
    }
  }
  // Push the last group
  if (currentGroup && currentGroup.images.length > 0) {
    imageGroups.push(currentGroup);
  }

  return (
    <div
      className="h-full flex"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 왼쪽 입력 패널 */}
      {(activeConversation?.is_owner !== false) && (
        <div className="relative shrink-0 bg-[#1e1e1e] flex flex-col p-4 space-y-4 overflow-y-auto" style={{ width: panelWidth }}>
          {/* 리사이즈 핸들 */}
          <div
            onMouseDown={startPanelResize}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
          />
          {/* 모델 선택 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">모델</label>
            <ModelSelector value={selectedProvider?.id ?? null} modelOverride={modelOverride} onChange={handleModelChange} mode="image" />
          </div>

          {/* 모드 전환 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">모드</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium ${
                  mode === 'generate' ? 'bg-white/10 text-white' : 'bg-[#2f2f2f] text-gray-500'
                }`}
              >
                <Wand2 className="w-4 h-4" /> 생성
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium ${
                  mode === 'edit' ? 'bg-white/10 text-white' : 'bg-[#2f2f2f] text-gray-500'
                }`}
              >
                <Paintbrush className="w-4 h-4" /> 편집
              </button>
            </div>
          </div>

          {/* 편집 모드 원본 이미지 */}
          {mode === 'edit' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                원본 이미지 ({sourceImageUrls.length}/{MAX_SOURCE_IMAGES})
              </label>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadSource} />
              {sourceImageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {sourceImageUrls.map((url, i) => (
                    <div key={url} className="relative group/src">
                      <img src={url} alt={`원본 ${i + 1}`} className="h-16 w-16 object-cover rounded-lg" />
                      <button
                        onClick={() => setSourceImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black/80 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {sourceImageUrls.length < MAX_SOURCE_IMAGES && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-sm text-gray-500 hover:border-gray-400 disabled:opacity-50"
                >
                  <Paperclip className="w-4 h-4" /> {uploading ? '업로드 중...' : '이미지 첨부'}
                </button>
              )}
            </div>
          )}

          {/* 생성 파라미터 (생성 + 편집 공통) */}
          <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">크기</label>
                <CustomSelect
                  value={size}
                  onChange={setSize}
                  options={[
                    { value: '256x256', label: '256 × 256 (1:1)' },
                    { value: '512x512', label: '512 × 512 (1:1)' },
                    { value: '1024x1024', label: '1024 × 1024 (1:1)' },
                    { value: '1536x1536', label: '1536 × 1536 (1:1)' },
                    { value: '2048x2048', label: '2048 × 2048 (1:1)' },
                    { value: '1024x1792', label: '1024 × 1792 (9:16)' },
                    { value: '1792x1024', label: '1792 × 1024 (16:9)' },
                    { value: '1024x1536', label: '1024 × 1536 (2:3)' },
                    { value: '1536x1024', label: '1536 × 1024 (3:2)' },
                    { value: '768x1024', label: '768 × 1024 (3:4)' },
                    { value: '1024x768', label: '1024 × 768 (4:3)' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">스타일</label>
                <CustomSelect
                  value={style}
                  onChange={setStyle}
                  options={[
                    { value: 'vivid', label: '선명 (Vivid)' },
                    { value: 'natural', label: '자연스러움 (Natural)' },
                    { value: 'photorealistic', label: '사진처럼 (Photorealistic)' },
                    { value: 'cinematic', label: '시네마틱 (Cinematic)' },
                    { value: 'anime', label: '애니메이션 (Anime)' },
                    { value: 'digital-art', label: '디지털 아트 (Digital Art)' },
                    { value: 'oil-painting', label: '유화 (Oil Painting)' },
                    { value: 'watercolor', label: '수채화 (Watercolor)' },
                    { value: 'sketch', label: '스케치 (Sketch)' },
                    { value: 'pixel-art', label: '픽셀 아트 (Pixel Art)' },
                    { value: '3d-render', label: '3D 렌더 (3D Render)' },
                    { value: 'isometric', label: '아이소메트릭 (Isometric)' },
                    { value: 'flat-design', label: '플랫 디자인 (Flat Design)' },
                    { value: 'minimalist', label: '미니멀리스트 (Minimalist)' },
                    { value: 'pop-art', label: '팝 아트 (Pop Art)' },
                  ]}
                />
              </div>
          </>

          {/* AI 프롬프트 보강 */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-gray-500 mb-1.5">
              <span>프롬프트 자동 다듬기</span>
              <button
                type="button"
                onClick={() => setAiEnhance(!aiEnhance)}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${aiEnhance ? 'bg-blue-500' : 'bg-[#3a3a3a]'}`}
              >
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${aiEnhance ? 'left-4' : 'left-0.5'}`} />
              </button>
            </label>
          </div>

          {/* 생성 수 */}
          {mode === 'generate' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">생성 수</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setVariations(Math.max(1, variations - 1))} className="w-7 h-7 flex items-center justify-center bg-[#2f2f2f] rounded-lg text-gray-300 hover:bg-[#3a3a3a] text-sm">−</button>
                <span className="w-7 text-center text-sm text-gray-300">{variations}</span>
                <button type="button" onClick={() => setVariations(Math.min(4, variations + 1))} className="w-7 h-7 flex items-center justify-center bg-[#2f2f2f] rounded-lg text-gray-300 hover:bg-[#3a3a3a] text-sm">+</button>
              </div>
            </div>
          )}

          {/* 프롬프트 입력 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">프롬프트</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder={mode === 'edit' ? '편집 내용을 설명하세요...' : '이미지를 설명하세요...'}
              rows={5}
              disabled={loading}
              className="w-full resize-y min-h-[120px] px-3 py-2 border-0 rounded-lg outline-none text-sm bg-[#2f2f2f] text-white placeholder-gray-500"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* 생성 버튼 */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full py-2 bg-white text-black rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? '생성 중...' : mode === 'edit' ? '편집' : '생성'}
          </button>
        </div>
      )}

      {/* 오른쪽 갤러리 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단 바 */}
        {activeConversation && (
          <div className="p-3 flex items-center gap-3">
            <span className="text-sm font-medium text-gray-200">
              {activeConversation.conversation.title}
            </span>
          </div>
        )}

        {/* 드래그 오버레이 */}
        {dragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#212121]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-blue-500 rounded-2xl bg-[#2f2f2f]/80">
              <ImagePlus className="w-10 h-10 text-blue-400" />
              <span className="text-blue-400 font-medium">이미지를 여기에 놓으세요</span>
            </div>
          </div>
        )}

        {/* 갤러리 */}
        <div className="flex-1 overflow-y-auto p-4">
          {imageGroups.length === 0 && !pendingGroup && (
            <div className="h-full flex items-center justify-center">
              <h2 className="text-2xl font-semibold text-white -translate-y-[60px]">어떤 이미지를 생성해드릴까요?</h2>
            </div>
          )}
          <div className="space-y-4">
            {/* Pending generation skeleton */}
            {pendingGroup && (
              <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden animate-[fadeIn_200ms_ease-in-out]">
                <div className="px-4 py-3 flex items-center gap-2">
                  <p className="flex-1 text-xs text-gray-400 truncate">{pendingGroup.prompt}</p>
                  <span className="text-[10px] text-gray-500">생성 중...</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 px-3 pb-3">
                  {Array.from({ length: pendingGroup.count }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-[#2a2a2a] flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-gray-600 border-t-gray-300 animate-spin" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {[...imageGroups].reverse().map((group, gi) => {
              const size = group.images[0]?.image_params?.size || '';
              const style = group.images[0]?.image_params?.style || '';
              const ratio = size ? getAspectRatio(size) : '';
              const date = group.images[0]?.created_at;
              const dateLabel = date ? (() => {
                const d = new Date(date);
                const now = new Date();
                const kstDay = d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' });
                const kstNowDay = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', day: 'numeric' });
                const diff = now.getTime() - d.getTime();
                if (diff < 86400000 && kstDay === kstNowDay) return 'Today';
                if (diff < 172800000) return 'Yesterday';
                return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
              })() : '';

              return (
                <div key={gi} className="bg-[#1a1a1a] rounded-2xl overflow-hidden">
                  {/* Group header */}
                  <div className="px-4 py-3 flex items-center gap-2">
                    <p className="flex-1 text-xs text-gray-400 truncate">{group.prompt}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {ratio && <span className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[10px] text-gray-400 font-medium">{ratio}</span>}
                      {style && <span className="px-1.5 py-0.5 bg-[#2f2f2f] rounded text-[10px] text-gray-400 font-medium capitalize">{style}</span>}
                      {dateLabel && <span className="text-[10px] text-gray-500 ml-1">{dateLabel}</span>}
                    </div>
                  </div>
                  {/* Images grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 px-3 pb-3">
                    {group.images.map((msg, mi) => (
                      <div
                        key={msg.id}
                        className="group/img relative cursor-pointer"
                        onClick={() => { setPromptExpanded(false); setLightbox({
                          src: msg.image_url!,
                          prompt: group.prompt || undefined,
                          enhancedPrompt: msg.image_params?.enhanced_prompt,
                          createdAt: msg.created_at,
                          size: msg.image_params?.size,
                          style: msg.image_params?.style,
                        }); }}
                      >
                        <img
                          src={msg.image_url!}
                          alt="생성됨"
                          className={`w-full object-cover aspect-square ${
                            mi === 0 ? 'rounded-tl-xl' : ''
                          } ${
                            mi === Math.min(2, group.images.length - 1) && group.images.length <= 3 ? 'rounded-tr-xl' : ''
                          } ${
                            mi === group.images.length - 1 ? 'rounded-br-xl' : ''
                          } ${
                            (group.images.length <= 3 && mi === 0) || (group.images.length > 3 && mi === (Math.ceil(group.images.length / 3) - 1) * 3) ? 'rounded-bl-xl' : ''
                          }`}
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors" />
                        {/* Enhanced prompt on hover */}
                        {(msg.image_params?.enhanced_prompt || group.prompt) && (
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/img:opacity-100 transition">
                            <p className="text-white text-[10px] line-clamp-2">{msg.image_params?.enhanced_prompt || group.prompt}</p>
                          </div>
                        )}
                        {/* Variation badge */}
                        {msg.image_params?.variation_index && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
                            {msg.image_params.variation_index}/{msg.image_params.variation_total}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Image detail view */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <div className="relative flex max-w-[92vw] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            {/* Left: image */}
            <img src={lightbox.src} alt="Preview" className="max-h-[92vh] max-w-[65vw] object-contain rounded-l-xl" />

            {/* Right: details panel */}
            <div className="w-80 shrink-0 bg-[#2f2f2f] rounded-r-xl flex flex-col overflow-y-auto">
              {/* Header */}
              <div className="p-4 border-b border-[#3a3a3a] flex items-center justify-between">
                <span className="text-sm font-medium text-white">Details</span>
                <button onClick={() => setLightbox(null)} className="w-7 h-7 bg-[#3a3a3a] rounded-full flex items-center justify-center text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-b border-[#3a3a3a] flex items-center gap-3">
                <a href={lightbox.src} download className="p-2 text-gray-400 hover:text-white hover:bg-[#3a3a3a] rounded-lg transition-colors" title="다운로드">
                  <Download className="w-4 h-4" />
                </a>
              </div>

              {/* Created at */}
              {lightbox.createdAt && (
                <div className="px-4 pt-3">
                  <p className="text-xs text-gray-500">
                    {new Date(lightbox.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}
                  </p>
                </div>
              )}

              {/* Prompt */}
              <div className="px-4 py-3 border-b border-[#3a3a3a]">
                <p className="text-xs font-medium text-gray-400 mb-2">Prompt</p>
                <p className={`text-sm text-gray-200 whitespace-pre-wrap leading-relaxed ${!promptExpanded ? 'line-clamp-4' : ''}`}>{lightbox.prompt || '—'}</p>
                {lightbox.prompt && lightbox.prompt.length > 150 && (
                  <button
                    onClick={() => setPromptExpanded(!promptExpanded)}
                    className="mt-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    {promptExpanded ? '접기' : 'See more'}
                  </button>
                )}
              </div>

              {/* Enhanced prompt */}
              {lightbox.enhancedPrompt && lightbox.enhancedPrompt !== lightbox.prompt && (
                <div className="px-4 py-3 border-b border-[#3a3a3a]">
                  <p className="text-xs font-medium text-blue-400 mb-2">AI Enhanced Prompt</p>
                  <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{lightbox.enhancedPrompt}</p>
                </div>
              )}

              {/* Settings */}
              {(lightbox.size || lightbox.style) && (
                <div className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-400 mb-2">Settings</p>
                  <div className="flex flex-wrap gap-2">
                    {lightbox.size && (
                      <span className="px-2.5 py-1 bg-[#3a3a3a] rounded-full text-xs text-gray-300">{lightbox.size} px</span>
                    )}
                    {lightbox.size && (
                      <span className="px-2.5 py-1 bg-[#3a3a3a] rounded-full text-xs text-gray-300">
                        {getAspectRatio(lightbox.size)}
                      </span>
                    )}
                    {lightbox.style && (
                      <span className="px-2.5 py-1 bg-[#3a3a3a] rounded-full text-xs text-gray-300 capitalize">{lightbox.style}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom spacer */}
              <div className="flex-1" />

              {/* Save / Download button */}
              <div className="p-4 border-t border-[#3a3a3a]">
                <a
                  href={lightbox.src}
                  download
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#3a3a3a] hover:bg-[#444] text-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" /> Save as
                </a>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
