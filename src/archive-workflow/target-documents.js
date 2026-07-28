const text = (value) => String(value ?? '').trim();

export function buildArchiveDocumentChoices({
  archive,
  documents = [],
} = {}) {
  if (!archive?.id) return [];
  return [
    ...(archive.origin === 'official'
      ? [{
          value: `official:${archive.id}`,
          label: '官方档案正文',
          targetContributionId: null,
          baseVersionId: null,
          official: true,
        }]
      : []),
    ...documents.map((document) => ({
      value: document.id,
      label: [
        text(document.title) || '未命名文档',
        `VER ${text(document.versionLabel) || '0.1'}`,
        text(document.ownerName) || '未署名',
      ].join(' / '),
      targetContributionId: document.id,
      baseVersionId: document.latestVersionId || null,
      official: false,
    })),
  ];
}

export function resolveArchiveDocumentTarget(choices = [], value) {
  const selectedValue = text(value);
  if (!selectedValue) return null;
  return choices.find((choice) => choice.value === selectedValue) || null;
}
