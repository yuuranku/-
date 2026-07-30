const normalized = (value) => String(value ?? '').trim().toLocaleLowerCase('zh-CN');

export const matchesArchiveIdentifier = (archive, identifier) => {
  const target = normalized(identifier);
  if (!target) return false;
  return [archive?.id, archive?.code, archive?.business_code, archive?.title]
    .filter(Boolean)
    .some((value) => normalized(value) === target);
};
