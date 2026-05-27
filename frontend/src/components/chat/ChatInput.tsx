import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, X, FileText, FileSpreadsheet, Presentation, Download } from 'lucide-react';
import { uploadFile } from '../../api/files';
import type { DocumentInfo } from '../../api/messages';

export const MAX_IMAGES = 5;
export const MAX_DOCS = 5;

const DOC_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx', '.hwp', '.txt', '.csv'];

let imageIdCounter = 0;
let docIdCounter = 0;

interface Props {
  onSend: (text: string, imageUrls?: string[], documents?: DocumentInfo[]) => void;
  disabled?: boolean;
  rightElement?: React.ReactNode;
  droppedFiles?: File[];
}

interface ImageEntry {
  id: number;
  url: string;
  uploaded: boolean;
}

interface DocEntry {
  id: number;
  name: string;
  url: string;
  uploaded: boolean;
  thumbnail_url?: string | null;
  page_count?: number | null;
}

function isDocumentFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return DOC_EXTENSIONS.includes(ext);
}

function DocIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'csv') return <FileSpreadsheet className={className} />;
  if (ext === 'pptx') return <Presentation className={className} />;
  return <FileText className={className} />;
}

function DocDetailModal({ doc, onClose }: { doc: DocEntry; onClose: () => void }) {
  const ext = doc.name.split('.').pop()?.toLowerCase();
  const baseThumbnail = doc.thumbnail_url;
  const baseNoExt = baseThumbnail?.replace(/\.png$/, '') || '';
  const pageCount = doc.page_count || null;
  const hasMultiplePages = pageCount && pageCount > 1;
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-[#2f2f2f] rounded-2xl p-6 max-w-md w-full mx-4 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-[#3a3a3a] rounded-full flex items-center justify-center text-gray-400 hover:text-white z-10">
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm text-gray-200 font-medium mb-4 pr-8 w-full break-words">{doc.name}</p>

        {/* Stacked page thumbnails with tilt on hover */}
        <a
          href={doc.url}
          download={doc.name}
          className="relative flex items-center justify-center mb-4 cursor-pointer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {baseThumbnail ? (
            <div className="relative w-64 h-64">
              {pageCount && pageCount >= 3 && (
                <img
                  src={`${baseNoExt}_p3.png`}
                  alt="Page 3"
                  className="absolute inset-0 w-64 h-64 rounded-lg object-cover shadow-md"
                  style={{
                    opacity: 0.6,
                    transformOrigin: 'center bottom',
                    transition: 'transform 300ms ease',
                    transform: hovered ? 'rotate(3deg)' : 'translate(8px, 8px)',
                  }}
                />
              )}
              {pageCount && pageCount >= 2 && (
                <img
                  src={`${baseNoExt}_p2.png`}
                  alt="Page 2"
                  className="absolute inset-0 w-64 h-64 rounded-lg object-cover shadow-md"
                  style={{
                    opacity: 0.8,
                    transformOrigin: 'center bottom',
                    transition: 'transform 300ms ease',
                    transform: hovered ? 'rotate(1.5deg)' : 'translate(4px, 4px)',
                  }}
                />
              )}
              <img
                src={baseThumbnail}
                alt="Page 1"
                className="relative w-64 h-64 rounded-lg object-cover shadow-lg"
                style={{
                  transformOrigin: 'center bottom',
                  transition: 'transform 300ms ease',
                  transform: hovered && hasMultiplePages ? 'rotate(-1.5deg)' : 'rotate(0deg)',
                }}
              />
            </div>
          ) : (
            <div className="h-48 w-48 bg-[#3a3a3a] rounded-xl flex flex-col items-center justify-center">
              <DocIcon name={doc.name} className="w-12 h-12 text-blue-400 mb-2" />
              <span className="text-xs text-gray-500 uppercase font-medium">{ext}</span>
            </div>
          )}
        </a>

        {/* Page count / Download text with fade */}
        <div className="relative h-5 w-full">
          <span className={`text-xs text-gray-500 transition-opacity duration-300 absolute inset-0 flex items-center justify-center whitespace-nowrap ${hovered ? 'opacity-0' : 'opacity-100'}`}>
            {pageCount ? `${pageCount} pages` : ext?.toUpperCase()}
          </span>
          <span className={`text-xs text-blue-400 transition-opacity duration-300 absolute inset-0 flex items-center justify-center gap-1 whitespace-nowrap ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <Download className="w-3.5 h-3.5" /> Download
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ChatInput({ onSend, disabled, rightElement, droppedFiles }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [previewDoc, setPreviewDoc] = useState<DocEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * 10;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    autoResize();
  }, [text, autoResize]);

  const uploading = images.some((img) => !img.uploaded) || docs.some((d) => !d.uploaded);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const uploadedUrls = images.filter((img) => img.uploaded).map((img) => img.url);
    const uploadedDocs = docs.filter((d) => d.uploaded).map((d) => ({ url: d.url, original_name: d.name, thumbnail_url: d.thumbnail_url, page_count: d.page_count }));
    if (!text.trim() && uploadedUrls.length === 0 && uploadedDocs.length === 0) return;
    onSend(
      text.trim(),
      uploadedUrls.length > 0 ? uploadedUrls : undefined,
      uploadedDocs.length > 0 ? uploadedDocs : undefined,
    );
    setText('');
    setImages([]);
    setDocs([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  const handleUpload = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (isDocumentFile(file)) {
        // Document file
        const entryId = ++docIdCounter;
        setDocs((prev) => {
          if (prev.length >= MAX_DOCS) return prev;
          return [...prev, { id: entryId, name: file.name, url: '', uploaded: false }];
        });
        try {
          const res = await uploadFile(file);
          setDocs((prev) =>
            prev.map((d) => (d.id === entryId ? { ...d, url: res.url, uploaded: true, thumbnail_url: res.thumbnail_url, page_count: res.page_count } : d))
          );
        } catch {
          setDocs((prev) => prev.filter((d) => d.id !== entryId));
          alert('파일 업로드에 실패했습니다');
        }
      } else if (file.type.startsWith('image/')) {
        // Image file
        const blobUrl = URL.createObjectURL(file);
        const entryId = ++imageIdCounter;
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, { id: entryId, url: blobUrl, uploaded: false }];
        });
        try {
          const res = await uploadFile(file);
          setImages((prev) =>
            prev.map((img) => (img.id === entryId ? { ...img, url: res.url, uploaded: true } : img))
          );
          URL.revokeObjectURL(blobUrl);
        } catch {
          setImages((prev) => prev.filter((img) => img.id !== entryId));
          URL.revokeObjectURL(blobUrl);
          alert('파일 업로드에 실패했습니다');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      handleUpload(droppedFiles);
    }
  }, [droppedFiles, handleUpload]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await handleUpload(files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (id: number) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeDoc = (id: number) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await handleUpload(files);
    }
  };

  const hasAttachments = images.length > 0 || docs.length > 0;
  const acceptTypes = 'image/*,.pdf,.docx,.xlsx,.pptx,.hwp,.txt,.csv';

  return (
    <div className="px-4 pb-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={acceptTypes}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className={`flex-1 flex flex-col rounded-3xl p-2 bg-[#2f2f2f]/70 backdrop-blur-xl ${disabled ? 'opacity-50' : ''}`}>
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: hasAttachments ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 flex-wrap p-2">
                {/* Image previews */}
                {images.map((img, i) => (
                  <div
                    key={img.id}
                    className="relative group animate-[fadeIn_200ms_ease-in-out_both]"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <img
                      src={img.url}
                      alt="첨부"
                      className="h-18 rounded-xl object-cover"
                    />
                    {!img.uploaded && (
                      <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                        <div className="h-4 w-16 rounded-full bg-[#3a3a3a] animate-pulse" />
                      </div>
                    )}
                    {img.uploaded && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeImage(img.id); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#2f2f2f] rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {/* Document previews */}
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="relative group animate-[fadeIn_200ms_ease-in-out_both] h-18 w-18 rounded-xl bg-[#3a3a3a] overflow-hidden cursor-pointer"
                    onClick={() => doc.uploaded && setPreviewDoc(doc)}
                  >
                    {!doc.uploaded ? (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <div className="w-10 h-1.5 rounded-full bg-[#555] animate-pulse mb-1.5" />
                        <div className="w-8 h-1.5 rounded-full bg-[#555] animate-pulse mb-1.5" />
                        <div className="w-6 h-1.5 rounded-full bg-[#555] animate-pulse" />
                      </div>
                    ) : (
                      <>
                        {/* Cover page thumbnail or icon */}
                        {doc.thumbnail_url ? (
                          <img src={doc.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <DocIcon name={doc.name} className="w-7 h-7 text-blue-400" />
                          </div>
                        )}
                        {/* Format badge */}
                        <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[8px] text-white uppercase font-bold leading-none">
                          {doc.name.split('.').pop()}
                        </span>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDoc(doc.id); }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#2f2f2f] rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || disabled}
              className="shrink-0 p-1.5 text-gray-500 hover:text-gray-300 disabled:opacity-50"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="메시지를 입력하세요... (파일 붙여넣기 또는 드래그 가능)"
              rows={1}
              disabled={disabled}
              className="flex-1 resize-none px-2 py-2 outline-none text-sm bg-transparent text-white placeholder-gray-500"
              style={{ overflowY: 'hidden' }}
            />
            {rightElement && <div className="shrink-0 pr-1">{rightElement}</div>}
          </div>
        </div>
      </form>

      {/* Document detail modal */}
      {previewDoc && createPortal(
        <DocDetailModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />,
        document.body
      )}
    </div>
  );
}
