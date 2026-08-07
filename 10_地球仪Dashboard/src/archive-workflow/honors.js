export const HONOR_RIBBON_SIZE = Object.freeze({ width: 240, height: 72, maxBytes: 250 * 1024 });

export const HONOR_CATEGORIES = Object.freeze([
  { id: 'mainline', label: '主线贡献', color: '#163d72' },
  { id: 'event', label: '重要事件', color: '#842f32' },
  { id: 'commission', label: '档案委托', color: '#1f5745' },
  { id: 'service', label: '长期服务', color: '#d9d8cf' },
  { id: 'investigation', label: '特殊调查', color: '#bb7b21' },
]);

export const honorCategory = (value) => {
  const normalized = String(value ?? '').trim();
  return HONOR_CATEGORIES.find((entry) => entry.id === normalized)
    || { id: normalized || 'unclassified', label: normalized || '未分类', color: '#65716c' };
};

export const normalizeHonorRibbon = (entry = {}) => ({
  id: String(entry.id ?? ''),
  code: String(entry.code ?? '').trim().toUpperCase(),
  title: String(entry.title ?? '').trim(),
  category: String(entry.category ?? '').trim() || 'unclassified',
  description: String(entry.description ?? '').trim(),
  imageUrl: String(entry.imageUrl ?? entry.image_url ?? '').trim(),
  issuedAt: entry.issuedAt ?? entry.issued_at ?? null,
  issueNote: String(entry.issueNote ?? entry.issue_note ?? '').trim(),
  status: entry.status === 'revoked' ? 'revoked' : 'active',
});

export const validateHonorRibbonFile = async (file) => {
  if (!file || !['image/png', 'image/webp'].includes(String(file.type).toLowerCase())) {
    throw new Error('授信条仅支持 PNG 或 WebP 图片');
  }
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > HONOR_RIBBON_SIZE.maxBytes) {
    throw new Error('授信条图片不能超过 250KB');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('无法读取授信条图片'));
      element.src = url;
    });
    if (image.naturalWidth !== HONOR_RIBBON_SIZE.width || image.naturalHeight !== HONOR_RIBBON_SIZE.height) {
      throw new Error('授信条必须严格为 240 × 72 px（10:3）');
    }
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('无法保存授信条图片'));
  reader.onload = () => resolve(String(reader.result || ''));
  reader.readAsDataURL(file);
});
