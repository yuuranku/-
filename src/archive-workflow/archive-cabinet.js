import { ARCHIVE_TEMPLATES } from './templates.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const archiveCabinetEntries = (role) => ARCHIVE_TEMPLATES.map((template) => {
  return {
    code: template.code,
    category: template.category,
    title: template.title,
    abbreviation: template.abbreviation,
    defaultKind: 'new',
    restricted: false,
    actionLabel: role === 'admin'
      ? '可新建、补充／修改／设定'
      : '可新建、补充／修改',
  };
});

export const renderArchiveCabinet = (role) => `
  <section class="archive-cabinet" data-archive-cabinet>
    <nav class="archive-cabinet__menubar" aria-label="档案柜菜单">
      <details data-cabinet-menu="file"><summary>文件</summary><div role="menu">
        <button type="button" role="menuitem" data-cabinet-action="open" disabled>打开</button>
        <button type="button" role="menuitem" data-cabinet-action="close">关闭</button>
      </div></details>
      <details data-cabinet-menu="view"><summary>查看</summary><div role="menu">
        <button type="button" role="menuitemradio" aria-checked="true" aria-pressed="true" data-cabinet-action="view-large">大图标</button>
      </div></details>
      <details data-cabinet-menu="help"><summary>帮助</summary><div role="menu">
        <button type="button" role="menuitem" data-cabinet-action="permissions">类别权限</button>
      </div></details>
    </nav>
    <label class="archive-cabinet__address">地址 <input value="C:\\PALIS\\ARCHIVES" readonly aria-readonly="true" /></label>
    <div class="archive-cabinet__grid" data-archive-cabinet-grid>
      ${archiveCabinetEntries(role).map((entry) => `
        <button type="button" data-archive-template="${escapeHtml(entry.code)}" data-default-kind="${escapeHtml(entry.defaultKind)}" aria-label="${escapeHtml(`${entry.title}，${entry.actionLabel}`)}">
          <i aria-hidden="true"><img src="/assets/icons/archive-${escapeHtml(entry.category)}.svg" alt="" /></i>
          <b>${escapeHtml(entry.title)}</b><small>${escapeHtml(entry.code)}.${escapeHtml(entry.abbreviation)} / ${escapeHtml(entry.actionLabel)}</small>
        </button>`).join('')}
    </div>
    <footer><output data-cabinet-selection>9 个对象</output><span>${escapeHtml(role === 'admin' ? 'ADMIN' : 'CLERK')}</span></footer>
    <dialog data-cabinet-permissions aria-labelledby="cabinet-permission-title"><form method="dialog">
      <h3 id="cabinet-permission-title">类别权限</h3>
      <p>${escapeHtml(role === 'admin' ? '管理员可新建、补充、修改并管理全部九类档案。' : '书记官可新建、补充或申请修改全部九类档案。')}</p>
      <button value="close">确定</button>
    </form></dialog>
  </section>`;
