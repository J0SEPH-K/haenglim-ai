import client from './client';

export async function uploadFile(file: File): Promise<{ url: string; filename: string; original_name: string; file_type: 'image' | 'document'; thumbnail_url: string | null; page_count: number | null }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
