"""Extract text content from document files."""
import os


DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".pptx", ".hwp", ".txt", ".csv"}


def extract_text(filepath: str) -> str:
    """Extract text from a document file. Returns extracted text or empty string."""
    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext == ".pdf":
            return _extract_pdf(filepath)
        elif ext == ".docx":
            return _extract_docx(filepath)
        elif ext == ".xlsx":
            return _extract_xlsx(filepath)
        elif ext == ".pptx":
            return _extract_pptx(filepath)
        elif ext == ".txt" or ext == ".csv":
            return _extract_text(filepath)
        elif ext == ".hwp":
            return _extract_hwp(filepath)
    except Exception as e:
        return f"[문서 읽기 오류: {str(e)}]"

    return ""


def _extract_pdf(filepath: str) -> str:
    import re
    import fitz
    doc = fitz.open(filepath)
    pages = []
    for i, page in enumerate(doc, 1):
        text = page.get_text()
        if text and text.strip():
            # Filter out garbled lines from image-based content
            clean_lines = []
            for line in text.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                # Count alphanumeric + Korean characters vs total
                alnum = len(re.findall(r'[\w\sㄱ-ㅎㅏ-ㅣ가-힣]', line))
                if len(line) > 0 and alnum / len(line) > 0.5:
                    clean_lines.append(line)
            clean_text = "\n".join(clean_lines)
            if clean_text.strip():
                pages.append(f"[페이지 {i}]\n{clean_text.strip()}")
    doc.close()
    return "\n\n".join(pages)


def _extract_docx(filepath: str) -> str:
    from docx import Document
    doc = Document(filepath)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_xlsx(filepath: str) -> str:
    from openpyxl import load_workbook
    wb = load_workbook(filepath, read_only=True, data_only=True)
    parts = []
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        rows = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(cells):
                rows.append("\t".join(cells))
        if rows:
            parts.append(f"[시트: {sheet}]\n" + "\n".join(rows))
    wb.close()
    return "\n\n".join(parts)


def _extract_pptx(filepath: str) -> str:
    from pptx import Presentation
    prs = Presentation(filepath)
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    if para.text.strip():
                        texts.append(para.text)
        if texts:
            slides.append(f"[슬라이드 {i}]\n" + "\n".join(texts))
    return "\n\n".join(slides)


def _extract_text(filepath: str) -> str:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def _extract_hwp(filepath: str) -> str:
    # HWP is a proprietary Korean format. Basic extraction via OLE compound file.
    import struct
    import zlib

    with open(filepath, "rb") as f:
        data = f.read()

    # Check for HWP5 OLE format
    if data[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        try:
            import olefile
            ole = olefile.OleFileIO(filepath)
            text_sections = []
            for stream in ole.listdir():
                name = "/".join(stream)
                if "BodyText" in name or "Section" in name:
                    raw = ole.openstream(stream).read()
                    try:
                        decompressed = zlib.decompress(raw, -15)
                        # Extract Unicode text from the binary stream
                        text = ""
                        i = 0
                        while i < len(decompressed) - 1:
                            char = struct.unpack_from("<H", decompressed, i)[0]
                            if 0x20 <= char < 0xFFFF and char not in (0xFEFF, 0xFFFE):
                                text += chr(char)
                            elif char in (0x0A, 0x0D):
                                text += "\n"
                            i += 2
                        if text.strip():
                            text_sections.append(text.strip())
                    except Exception:
                        pass
            ole.close()
            if text_sections:
                return "\n\n".join(text_sections)
        except ImportError:
            pass

    return "[HWP 파일: olefile 라이브러리가 필요합니다. pip install olefile]"
