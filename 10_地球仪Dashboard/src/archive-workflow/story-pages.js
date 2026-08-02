const storyWriterRoles = new Set(['observer', 'clerk', 'admin']);

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const storyPageLabel = (index) => `留言 ${String(Number(index) + 1).padStart(2, '0')}`;

export const validateArchiveStoryBody = (body) => {
  const value = String(body ?? '').trim();
  if (!value) return { error: '留言内容不能为空' };
  if ([...value].length > 4000) return { error: '留言不能超过 4000 字' };
  return { value };
};

export const validateArchiveStoryTitle = (title) => {
  const value = String(title ?? '').trim();
  if (!value) return { error: '留言标题不能为空' };
  if ([...value].length > 60) return { error: '留言标题不能超过 60 字' };
  return { value };
};

export const canCreateArchiveStoryPage = (session = {}) =>
  Boolean(session.profileId && storyWriterRoles.has(session.role));

export const canManageArchiveStoryPage = (page, session = {}) =>
  Boolean(
    session.profileId
    && (session.role === 'admin' || page?.author_id === session.profileId),
  );

export const renderArchiveStoryMenu = (pages = [], { canCreate = false } = {}) => {
  const entries = pages.map((page, index) => `
    <button type="button" role="menuitem" data-archive-story-page="${escapeHtml(page.id)}">${escapeHtml(page.title || storyPageLabel(index))}</button>
  `).join('');
  const create = canCreate
    ? `${pages.length ? '<hr />' : ''}<button type="button" role="menuitem" data-archive-story-action="create">添加留言</button>`
    : '';
  return entries || create
    ? `${entries}${create}`
    : '<span class="dialog-menu__empty">暂无留言</span>';
};
