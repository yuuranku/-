const MEBIBYTE = 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const WEBP_QUALITIES = Object.freeze([0.82, 0.75, 0.68, 0.61, 0.54, 0.47, 0.4]);

const defineSlot = (role, field, limit, label) => Object.freeze({
  role,
  field,
  limit,
  label,
});

const EMPTY_POLICY = Object.freeze({
  category: '',
  accept: SUPPORTED_IMAGE_TYPES,
  maxSourceBytes: 5 * MEBIBYTE,
  maxBytes: 800 * 1024,
  slots: Object.freeze([]),
});

const MEDIA_POLICIES = Object.freeze({
  country: Object.freeze({
    ...EMPTY_POLICY,
    category: 'country',
    slots: Object.freeze([
      defineSlot('country-flag', 'photo', 1, '国家旗帜'),
    ]),
  }),
  organization: Object.freeze({
    ...EMPTY_POLICY,
    category: 'organization',
    slots: Object.freeze([
      defineSlot('organization-cover', 'photo', 1, '组织主图'),
    ]),
  }),
  station: Object.freeze({
    ...EMPTY_POLICY,
    category: 'station',
    slots: Object.freeze([
      defineSlot('station-cover', 'photo', 1, '站点主图'),
    ]),
  }),
  entrance: Object.freeze({
    ...EMPTY_POLICY,
    category: 'entrance',
    slots: Object.freeze([
      defineSlot('entrance-cover', 'photo', 1, '入口主图'),
    ]),
  }),
  ecology: Object.freeze({
    ...EMPTY_POLICY,
    category: 'ecology',
    slots: Object.freeze([
      defineSlot('ecology-cover', 'photo', 1, '生态主图'),
    ]),
  }),
  person: Object.freeze({
    ...EMPTY_POLICY,
    category: 'person',
    slots: Object.freeze([
      defineSlot('portrait', 'photo', 1, '人物头像'),
    ]),
  }),
  event: Object.freeze({
    ...EMPTY_POLICY,
    category: 'event',
    slots: Object.freeze([
      defineSlot('event-cover', 'photo', 1, '事件封面'),
      defineSlot('event-evidence', 'evidence', 6, '事件证据图'),
    ]),
  }),
  anomaly: Object.freeze({
    ...EMPTY_POLICY,
    category: 'anomaly',
    slots: Object.freeze([
      defineSlot('anomaly-cover', 'photo', 1, '异常档案主图'),
      defineSlot('anomaly-image', 'evidence', 6, '正文附图'),
    ]),
  }),
  species: Object.freeze({
    ...EMPTY_POLICY,
    category: 'species',
    slots: Object.freeze([
      defineSlot('species-cover', 'photo', 1, '标本主图'),
      defineSlot('species-image', 'evidence', 6, '正文附图'),
    ]),
  }),
});

const mediaError = (code, message) => Object.assign(new Error(message), { code });
const text = (value, maximum = 500) => String(value ?? '').trim().slice(0, maximum);
const mediaUrl = (value) => {
  const url = text(value, 4096);
  return /^(?:https?:|blob:|data:image\/)/i.test(url) ? url : '';
};

export const mediaPolicyForCategory = (category) =>
  MEDIA_POLICIES[String(category ?? '').trim()] || {
    ...EMPTY_POLICY,
    category: String(category ?? '').trim(),
  };

const fieldForRole = (role, fallback) => {
  if (fallback) return fallback;
  if ([
    'country-flag', 'organization-cover', 'station-cover', 'entrance-cover', 'ecology-cover',
    'portrait', 'photo', 'event-cover', 'anomaly-cover', 'species-cover',
  ].includes(role)) return 'photo';
  if (['event-evidence', 'anomaly-image', 'species-image'].includes(role)) return 'evidence';
  return '';
};

export const normalizeArchiveMedia = (media) => (
  Array.isArray(media) ? media : []
)
  .map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const role = text(entry.role, 40);
    const attachmentId = text(entry.attachmentId ?? entry.id, 160);
    const storagePath = text(entry.storagePath ?? entry.storage_path, 1024);
    const publicUrl = mediaUrl(entry.publicUrl);
    const dataUrl = mediaUrl(entry.dataUrl);
    const field = fieldForRole(role, text(entry.field, 40));
    if (!attachmentId && !storagePath && !publicUrl && !dataUrl) return null;
    const sortOrder = Number(entry.sortOrder ?? entry.sort_order ?? 0);
    const fileName = text(entry.fileName ?? entry.file_name, 240);
    const mimeType = text(entry.mimeType ?? entry.mime_type, 120);
    const byteSize = Math.max(0, Number(entry.byteSize ?? entry.byte_size) || 0);
    return {
      attachmentId,
      field,
      role,
      storagePath,
      publicUrl,
      dataUrl,
      ...(fileName ? { fileName } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(byteSize ? { byteSize } : {}),
      altText: text(entry.altText ?? entry.alt_text, 500),
      caption: text(entry.caption, 1000),
      sortOrder: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
    };
  })
  .filter(Boolean)
  .sort((left, right) =>
    left.sortOrder - right.sortOrder
    || left.role.localeCompare(right.role)
    || left.attachmentId.localeCompare(right.attachmentId));

export const durableArchiveMedia = (media) => normalizeArchiveMedia(media)
  .filter((entry) => entry.attachmentId || entry.storagePath)
  .map(({
    attachmentId,
    field,
    role,
    storagePath,
    altText,
    caption,
    sortOrder,
  }) => ({
    attachmentId,
    field,
    role,
    storagePath,
    altText,
    caption,
    sortOrder,
  }));

const createCanvas = (width, height) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw mediaError('media_canvas_unavailable', 'This browser cannot prepare archive images');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const canvasBlob = (canvas, quality) => {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(mediaError('media_encode_failed', 'Archive image encoding failed')),
      'image/webp',
      quality,
    );
  });
};

const webpName = (name) => {
  const source = text(name, 180) || 'archive-image';
  const stem = source.replace(/\.[^.]+$/, '').replaceAll(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
  return `${stem || 'archive-image'}.webp`;
};

const namedImage = (blob, source) => {
  const name = webpName(source?.name);
  if (typeof File === 'function') {
    return new File([blob], name, {
      type: 'image/webp',
      lastModified: Number(source?.lastModified) || Date.now(),
    });
  }
  Object.defineProperty(blob, 'name', { value: name, configurable: true });
  Object.defineProperty(blob, 'lastModified', {
    value: Number(source?.lastModified) || Date.now(),
    configurable: true,
  });
  return blob;
};

export async function optimizeArchiveImage(file, {
  maxEdge = 1600,
  maxBytes = 800 * 1024,
  maxSourceBytes = 5 * MEBIBYTE,
} = {}) {
  const type = text(file?.type, 100).toLowerCase();
  const size = Number(file?.size);
  if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
    throw mediaError('invalid_media_type', 'Archive images must be JPEG, PNG, or WebP');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw mediaError('invalid_media_size', 'Archive image is empty');
  }
  if (size > maxSourceBytes) {
    throw mediaError('media_source_too_large', 'Archive image exceeds the 5MB preparation limit');
  }
  if (typeof createImageBitmap !== 'function') {
    throw mediaError('media_decoder_unavailable', 'This browser cannot decode archive images');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const sourceWidth = Math.max(Number(bitmap.width) || 0, 1);
    const sourceHeight = Math.max(Number(bitmap.height) || 0, 1);
    const scale = Math.min(1, Math.max(Number(maxEdge) || 1600, 1)
      / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext?.('2d', { alpha: false });
    if (!context?.drawImage) {
      throw mediaError('media_canvas_unavailable', 'This browser cannot prepare archive images');
    }
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of WEBP_QUALITIES) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size > 0 && blob.size <= maxBytes) return namedImage(blob, file);
    }
    throw mediaError(
      'media_optimized_too_large',
      'The optimized archive image is still larger than 800KB',
    );
  } finally {
    bitmap.close?.();
  }
}
