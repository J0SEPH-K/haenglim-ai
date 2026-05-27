import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, FileSpreadsheet, Presentation, X, Download } from 'lucide-react';
import type { Message } from '../../types';

interface Props {
  message: Message;
  typing?: boolean;
  onTypingTick?: () => void;
  onTypingDone?: () => void;
}

function DocIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'csv') return <FileSpreadsheet className={className} />;
  if (ext === 'pptx') return <Presentation className={className} />;
  return <FileText className={className} />;
}

function ImageWithSkeleton({ src, alt, className, onClick }: { src: string; alt: string; className: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative cursor-pointer" onClick={onClick}>
      {!loaded && (
        <div className={`${className} bg-[#2f2f2f] animate-pulse`} style={{ minHeight: 200, minWidth: 200 }} />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${loaded ? '' : 'absolute opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function ImageLightbox({ src, filename, onClose }: { src: string; filename: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-2 -right-2 w-8 h-8 bg-[#2f2f2f] rounded-full flex items-center justify-center text-gray-300 hover:text-white z-10">
          <X className="w-5 h-5" />
        </button>
        <img src={src} alt="Preview" className="max-w-full max-h-[80vh] rounded-lg object-contain" />
        <p className="mt-3 text-sm text-gray-400">{filename}</p>
      </div>
    </div>
  );
}

interface DocData {
  url: string;
  name: string;
  thumbnail_url?: string | null;
  page_count?: number | null;
}

function DocPreviewModal({ doc, onClose }: { doc: DocData; onClose: () => void }) {
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

export default function MessageBubble({ message, typing, onTypingTick, onTypingDone }: Props) {
  const isUser = message.role === 'user';
  const [displayedText, setDisplayedText] = useState(typing ? '' : (message.text || ''));
  const indexRef = useRef(0);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; filename: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocData | null>(null);

  useEffect(() => {
    if (!typing || !message.text) return;

    indexRef.current = 0;
    setDisplayedText('');

    const interval = setInterval(() => {
      indexRef.current++;
      if (indexRef.current >= message.text!.length) {
        setDisplayedText(message.text!);
        clearInterval(interval);
        onTypingDone?.();
      } else {
        setDisplayedText(message.text!.slice(0, indexRef.current));
        onTypingTick?.();
      }
    }, 15);

    return () => clearInterval(interval);
  }, [typing, message.text]);

  const imageUrls: string[] =
    message.image_params?.image_urls ||
    (message.image_url ? [message.image_url] : []);

  const documents: DocData[] = message.image_params?.documents || [];

  const textContent = typing ? displayedText : message.text;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Text bubble */}
      {textContent && (
        <div
          className={
            isUser ? 'max-w-[70%] bg-[#3a3a3a] text-white rounded-2xl px-4 py-2.5' : 'w-full text-gray-200'
          }
        >
          {isUser ? (
            <p className="text-base whitespace-pre-wrap">{textContent}</p>
          ) : (
            <div className="prose-dark">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
      {/* Images — outside bubble, no background */}
      {imageUrls.length === 1 && (
        <ImageWithSkeleton
          src={imageUrls[0]}
          alt="Attached"
          className="mt-2 rounded-lg max-w-[70%] max-h-80 object-contain"
          onClick={() => setLightboxImage({ src: imageUrls[0], filename: imageUrls[0].split('/').pop() || 'image' })}
        />
      )}
      {imageUrls.length > 1 && (
        <div className={`mt-2 grid grid-cols-2 gap-1.5 max-w-[70%] ${isUser ? 'justify-self-end' : ''}`}>
          {imageUrls.map((url, i) => (
            <ImageWithSkeleton
              key={i}
              src={url}
              alt={`Attached ${i + 1}`}
              className="rounded-lg w-full object-cover aspect-square"
              onClick={() => setLightboxImage({ src: url, filename: url.split('/').pop() || `image_${i + 1}` })}
            />
          ))}
        </div>
      )}
      {/* Documents */}
      {documents.length > 0 && (
        <div className={`mt-2 flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
          {documents.map((doc, i) => (
            <div
              key={i}
              className="relative z-10 w-20 h-20 rounded-lg bg-[#2f2f2f] cursor-pointer hover:brightness-110 transition overflow-hidden"
              onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
            >
              {doc.thumbnail_url ? (
                <img src={doc.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <DocIcon name={doc.name} className="w-8 h-8 text-blue-400" />
                </div>
              )}
              {/* Format badge */}
              <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[8px] text-white uppercase font-bold leading-none">
                {doc.name.split('.').pop()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Image lightbox — rendered in portal to avoid overflow clipping */}
      {lightboxImage && createPortal(
        <ImageLightbox
          src={lightboxImage.src}
          filename={lightboxImage.filename}
          onClose={() => setLightboxImage(null)}
        />,
        document.body
      )}

      {/* Document preview modal — rendered in portal */}
      {previewDoc && createPortal(
        <DocPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />,
        document.body
      )}
    </div>
  );
}
