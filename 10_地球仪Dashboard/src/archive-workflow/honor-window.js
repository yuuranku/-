import {
  fileAsDataUrl,
  HONOR_CATEGORIES,
  HONOR_RIBBON_SIZE,
  honorCategory,
  validateHonorRibbonFile,
} from './honors.js';

const HONOR_ICON = '/assets/icons/archive-users.svg';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))
  : '日期未记';

const categoryOptions = (selected = 'mainline') => HONOR_CATEGORIES.map((category) => `
  <option value="${escapeHtml(category.id)}" ${category.id === selected ? 'selected' : ''}>${escapeHtml(category.label)}</option>
`).join('');

const styleLibraryMarkup = (ribbons = []) => ribbons.length ? ribbons.map((ribbon) => `
  <article class="honor-control__style">
    <img src="${escapeHtml(ribbon.imageUrl)}" alt="${escapeHtml(ribbon.title || ribbon.code)}" />
    <span>${escapeHtml(ribbon.title || ribbon.code)}</span>
  </article>
`).join('') : '<p class="honor-control__empty">还没有保存的条带样式。</p>';

const clerkOptions = (profiles = [], selected = '') => profiles
  .filter((profile) => profile.enabled !== false && profile.role === 'clerk')
  .map((profile) => `<option value="${escapeHtml(profile.id)}" ${profile.id === selected ? 'selected' : ''}>${escapeHtml(profile.display_name || profile.email)}${profile.role === 'admin' ? ' / 管理员' : ''}</option>`)
  .join('');

const clerkPickerMarkup = (profiles = [], selectedIds = new Set()) => profiles
  .filter((profile) => profile.enabled !== false && profile.role === 'clerk')
  .map((profile) => `<label class="honor-control__clerk-option">
    <input type="checkbox" name="clerkIds" value="${escapeHtml(profile.id)}" ${selectedIds.has(profile.id) ? 'checked' : ''} />
    <span>${escapeHtml(profile.display_name || profile.email)}</span>
  </label>`)
  .join('') || '<p class="honor-control__empty">暂无可授信的书记官。</p>';

const styleOptions = (ribbons = []) => ribbons.map((ribbon) => `<option value="${escapeHtml(ribbon.id)}">${escapeHtml(ribbon.title || ribbon.code)}</option>`).join('');

const honorNotification = ({ recipient, code, title, category, description }) => `书记官 ${recipient}：

恭喜你获得「${title}」。

为表彰你留下的这份记录与付出，南极公约监管办公室已将该项授信正式写入你的公开履历。

授信编号：${code}
归类：${honorCategory(category).label}

${description}

对应授信条已同步归档。感谢你为人类共同事业所作出的贡献。愿这份记录在未来的工作中，成为你继续前行的动力。

南极公约监管办公室
宣传部授信管理处`;

const clerkHonorMarkup = (honors = []) => honors.length ? honors.map((honor) => {
  const category = honorCategory(honor.category);
  return `<article class="honor-control__award" data-award-status="${escapeHtml(honor.status)}">
    <img src="${escapeHtml(honor.imageUrl)}" alt="${escapeHtml(honor.title)}" />
    <div><b>${escapeHtml(honor.code)} / ${escapeHtml(honor.title)}</b><small>${escapeHtml(category.label)} / ${escapeHtml(dateLabel(honor.issued_at))}</small><p>${escapeHtml(honor.description)}</p></div>
    <footer>${honor.status === 'revoked'
      ? ''
      : `<button type="button" data-honor-action="revoke" data-award-id="${escapeHtml(honor.award_id || honor.id)}" aria-label="取消授信">× 取消授信</button>`}</footer>
  </article>`;
}).join('') : '<p class="honor-control__empty">该人员尚无授信记录。</p>';

export const openHonorAdministrationWindow = async ({ createWindow, client } = {}) => {
  if (typeof createWindow !== 'function') throw new TypeError('createWindow is required');
  const state = createWindow({
    key: 'honor-control', title: '授勋管理器 / ADMIN', code: 'HONOR.CTL',
    className: 'honor-control-window', icon: HONOR_ICON,
    body: `<section class="honor-control" data-honor-control>
      <header><div><span>PALIS / CREDENTIAL ISSUANCE</span><b>授勋管理器</b></div><i>ISSUE / REVOKE / LEDGER</i></header>
      <div class="honor-control__body">
        <aside>
          <header><span>RIBBON STYLE LIBRARY</span><b>可复用条带样式</b></header>
          <p>这里只保存图案样式。保存后可在右侧反复用于不同荣誉。</p>
          <form data-honor-style-form>
            <label>上传图样<input name="file" type="file" accept="image/png,image/webp" required /></label>
            <small class="honor-control__file-rule">严格 ${HONOR_RIBBON_SIZE.width} × ${HONOR_RIBBON_SIZE.height}px（10:3）/ PNG 或 WebP / 不超过 ${HONOR_RIBBON_SIZE.maxBytes / 1024}KB</small>
            <button type="submit">保存为可复用样式</button>
          </form>
          <section class="honor-control__style-library"><h2>已保存样式</h2><div data-honor-style-library>正在读取……</div></section>
        </aside>
        <main>
          <header><div><span>PERSONNEL / CREDENTIAL LEDGER</span><b>授予荣誉</b></div><ul class="honor-control__category-guide" aria-label="荣誉分类颜色提示">${HONOR_CATEGORIES.map((category) => `<li title="${escapeHtml(category.label)}：制图底色提示"><i style="--honor-category:${escapeHtml(category.color)}"></i><span>${escapeHtml(category.label)}</span></li>`).join('')}</ul></header>
          <form class="honor-control__issue" data-honor-issue-form>
            <label class="honor-control__full">授信对象
              <div class="honor-control__clerk-picker" data-honor-clerk-picker></div>
              <small class="honor-control__batch-summary" data-honor-batch-summary>请选择至少一名书记官。</small>
            </label>
            <label>查看履历<select data-honor-clerk></select></label>
            <label>编号<input data-honor-code-preview value="AUTO / ISSUANCE ORDER" readonly aria-label="自动编号" /></label>
            <label>名称<input name="title" maxlength="100" required /></label>
            <label>归类<select name="category" required>${categoryOptions()}</select></label>
            <label>条带样式<select name="ribbonId" data-honor-ribbon required></select></label>
            <label class="honor-control__full">说明<textarea name="description" maxlength="500" required></textarea></label>
            <button type="submit" data-honor-issue-submit>授予已选书记官</button>
          </form>
          <section class="honor-control__person-ledger"><h2 data-honor-ledger-title>选择一名书记官</h2><div data-honor-person-ledger>从上方选择人员后读取完整授信履历。</div></section>
        </main>
      </div>
      <p data-honor-control-status>正在读取样式库……</p>
    </section>`,
  });
  const root = state.windowElement.querySelector('[data-honor-control]');
  const status = root.querySelector('[data-honor-control-status]');
  const library = root.querySelector('[data-honor-style-library]');
  const clerkSelect = root.querySelector('[data-honor-clerk]');
  const clerkPicker = root.querySelector('[data-honor-clerk-picker]');
  const batchSummary = root.querySelector('[data-honor-batch-summary]');
  const issueButton = root.querySelector('[data-honor-issue-submit]');
  const ribbonSelect = root.querySelector('[data-honor-ribbon]');
  const codePreview = root.querySelector('[data-honor-code-preview]');
  const ledger = root.querySelector('[data-honor-person-ledger]');
  const ledgerTitle = root.querySelector('[data-honor-ledger-title]');
  let ribbons = [];
  let profiles = [];
  let awards = [];
  let selectedClerkIds = new Set();
  const selectedProfile = () => profiles.find((profile) => profile.id === clerkSelect.value) || null;
  const selectedRecipients = () => profiles.filter((profile) => selectedClerkIds.has(profile.id));
  const updateCodePreview = () => {
    codePreview.value = `AUTO / ${honorCategory(root.querySelector('[name="category"]').value).label}`;
  };
  const updateBatchSummary = () => {
    const count = selectedRecipients().length;
    batchSummary.textContent = count
      ? `已选择 ${count} 名书记官；每人将获得独立自动编号并收到站内通知。`
      : '请选择至少一名书记官。';
    issueButton.textContent = count ? `授予已选 ${count} 名书记官` : '授予已选书记官';
  };
  const render = () => {
    library.innerHTML = styleLibraryMarkup(ribbons);
    const previousClerk = clerkSelect.value;
    clerkSelect.innerHTML = `<option value="">选择书记官</option>${clerkOptions(profiles, previousClerk)}`;
    if (previousClerk && [...clerkSelect.options].some((option) => option.value === previousClerk)) clerkSelect.value = previousClerk;
    const previousStyle = ribbonSelect.value;
    ribbonSelect.innerHTML = `<option value="">选择已保存样式</option>${styleOptions(ribbons)}`;
    if (previousStyle && [...ribbonSelect.options].some((option) => option.value === previousStyle)) ribbonSelect.value = previousStyle;
    const availableClerkIds = new Set(profiles
      .filter((profile) => profile.enabled !== false && profile.role === 'clerk')
      .map((profile) => profile.id));
    selectedClerkIds = new Set([...selectedClerkIds].filter((id) => availableClerkIds.has(id)));
    clerkPicker.innerHTML = clerkPickerMarkup(profiles, selectedClerkIds);
    const profile = selectedProfile();
    ledgerTitle.textContent = profile ? `${profile.display_name || profile.email} / 授信履历` : '选择一名书记官';
    ledger.innerHTML = profile ? clerkHonorMarkup(awards) : '从上方选择人员后读取完整授信履历。';
    updateCodePreview();
    updateBatchSummary();
  };
  const loadLedger = async () => {
    const profile = selectedProfile();
    if (!profile) { awards = []; render(); return; }
    ledger.textContent = '正在调阅授信履历……';
    try { awards = await client.listClerkHonors(profile.id); render(); } catch (error) {
      awards = []; ledger.innerHTML = `<p class="honor-control__empty">${escapeHtml(error.message || '无法读取授信履历')}</p>`;
    }
  };
  const reload = async () => {
    try {
      [ribbons, profiles] = await Promise.all([client.listHonorRibbons(), client.listUsers()]);
      render();
      if (selectedProfile()) await loadLedger();
      status.textContent = `样式库已更新 / ${dateLabel(new Date())}`;
    } catch (error) { status.textContent = error.message || '无法读取样式库'; }
  };
  if (!state.honorControlReady) {
    state.honorControlReady = true;
    clerkSelect.addEventListener('change', () => { void loadLedger(); });
    clerkPicker.addEventListener('change', (event) => {
      const input = event.target.closest('input[name="clerkIds"]');
      if (!input) return;
      if (input.checked) selectedClerkIds.add(input.value);
      else selectedClerkIds.delete(input.value);
      updateBatchSummary();
    });
    root.querySelector('[name="category"]').addEventListener('change', updateCodePreview);
    root.addEventListener('submit', async (event) => {
      const form = event.target;
      if (form.matches('[data-honor-style-form]')) {
        event.preventDefault();
        const file = new FormData(form).get('file');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await validateHonorRibbonFile(file);
          await client.createHonorRibbon({ file, imageUrl: await fileAsDataUrl(file) });
          form.reset(); status.textContent = '条带样式已保存，可重复使用。'; await reload();
        } catch (error) { status.textContent = error.message || '无法保存条带样式'; } finally { button.disabled = false; }
      }
      if (form.matches('[data-honor-issue-form]')) {
        event.preventDefault();
        const values = new FormData(form);
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const recipients = selectedRecipients();
          if (!recipients.length) throw new Error('请至少选择一名书记官');
          const award = {
            ribbonId: values.get('ribbonId'),
            title: values.get('title'), category: values.get('category'), description: values.get('description'),
          };
          const outcomes = [];
          for (const recipient of recipients) {
            try {
              const issued = await client.issueClerkHonor({ ...award, clerkId: recipient.id });
              try {
                await client.sendHonorNotification(recipient.id, {
                  subject: '授信通知',
                  message: honorNotification({
                    recipient: recipient.display_name || recipient.email || '书记官',
                    code: issued.code,
                    title: award.title,
                    category: award.category,
                    description: award.description,
                  }),
                });
                outcomes.push({ id: recipient.id, issued: true, notified: true });
              } catch (notificationError) {
                outcomes.push({ id: recipient.id, issued: true, notified: false, error: notificationError });
              }
            } catch (issueError) {
              outcomes.push({ id: recipient.id, issued: false, notified: false, error: issueError });
            }
          }
          const issuedCount = outcomes.filter((outcome) => outcome.issued).length;
          const notifiedCount = outcomes.filter((outcome) => outcome.notified).length;
          const failedIssues = outcomes.filter((outcome) => !outcome.issued);
          const failedNotices = outcomes.filter((outcome) => outcome.issued && !outcome.notified).length;
          if (failedIssues.length) {
            selectedClerkIds = new Set(failedIssues.map((outcome) => outcome.id));
            render();
            status.textContent = `批量授信完成：${issuedCount} 名已发放，${notifiedCount} 名已收到通知；${failedIssues.length} 名未完成，已保留勾选。${failedNotices ? `另有 ${failedNotices} 封通知未寄出。` : ''}`;
          } else {
            selectedClerkIds.clear();
            form.reset();
            render();
            status.textContent = failedNotices
              ? `已向 ${issuedCount} 名书记官批量授信；${notifiedCount} 封通知已寄出，${failedNotices} 封未寄出。`
              : `已向 ${issuedCount} 名书记官批量授信，并分别寄送站内通知。`;
          }
          await loadLedger();
        } catch (error) { status.textContent = error.message || '无法授予该荣誉'; } finally { button.disabled = false; }
      }
    });
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-honor-action="revoke"]');
      if (!button) return;
      const note = globalThis.window?.prompt?.('撤销说明（可留空）：', '') ?? null;
      if (note === null) return;
      button.disabled = true;
      try { await client.revokeClerkHonor(button.dataset.awardId, note); status.textContent = '授信已取消，并已从该书记官的可见档案中移除。'; await loadLedger(); } catch (error) { status.textContent = error.message || '无法撤销该荣誉'; button.disabled = false; }
    });
  }
  await reload();
  return state;
};
