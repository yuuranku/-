const EMBED_STYLE_ID = 'palis-workspace-embed-styles';

const normalizeText = (value) => String(value ?? '').replaceAll(/\s+/g, ' ').trim();

export const createEditorEmbedLayout = ({
  root,
  onHeightChange = () => {},
  onOutlineChange = () => {},
  onError = () => {},
  schedule = (callback) => root.defaultView.requestAnimationFrame(callback),
  cancelSchedule = (id) => root.defaultView.cancelAnimationFrame(id),
} = {}) => {
  if (!root?.documentElement || !root?.body) {
    throw new TypeError('An embedded template document is required');
  }

  root.documentElement.dataset.palisWorkspaceEmbed = 'true';
  if (!root.getElementById?.(EMBED_STYLE_ID)) {
    const style = root.createElement('style');
    style.id = EMBED_STYLE_ID;
    style.textContent = `
      html[data-palis-workspace-embed='true'],
      html[data-palis-workspace-embed='true'] body {
        overflow: hidden !important;
        background: #3a3226;
      }
      html[data-palis-workspace-embed='true'] .actionbar.no-print { display: none !important; }
      html[data-palis-workspace-embed-error='true'],
      html[data-palis-workspace-embed-error='true'] body { overflow: auto !important; }
      html[data-palis-workspace-embed='true'] [data-index-synchronized='true'] {
        position: relative;
        outline: 1px dashed rgba(217, 167, 59, .72);
        outline-offset: 3px;
      }
      html[data-palis-workspace-embed='true'] [data-index-synchronized='true']::after {
        content: attr(data-index-synchronized-label);
        position: absolute;
        top: 0;
        right: 0;
        white-space: nowrap;
        pointer-events: none;
        transform: translateY(-115%);
        color: #d9a73b;
        font: 400 10px/1.4 var(--font-mono);
      }
    `;
    root.head.append(style);
  }

  const contentRoot = root.querySelector('#doc') || root.querySelector('main') || root.body;
  let frame = null;
  let disposed = false;

  const getSectionOutline = () => [...root.querySelectorAll('.sect')].map((section, index) => {
    const id = section.id || `palis-section-${String(index + 1).padStart(2, '0')}`;
    section.id = id;
    return {
      id,
      label: normalizeText(section.querySelector('.sect-label')?.textContent)
        || `档案分区 ${String(index + 1).padStart(2, '0')}`,
      offsetTop: Math.max(0, Math.round(
        section.getBoundingClientRect().top - contentRoot.getBoundingClientRect().top,
      )),
    };
  });

  const measure = () => {
    frame = null;
    if (disposed) return 0;
    const height = Math.ceil(Math.max(
      root.documentElement.scrollHeight || 0,
      root.body.scrollHeight || 0,
      contentRoot.scrollHeight || 0,
    ));
    if (!Number.isFinite(height) || height < 1) {
      root.documentElement.dataset.palisWorkspaceEmbedError = 'true';
      onError(new RangeError('Embedded template height is unavailable'));
      return 0;
    }
    delete root.documentElement.dataset.palisWorkspaceEmbedError;
    onHeightChange(height);
    onOutlineChange(getSectionOutline());
    return height;
  };

  const queue = () => {
    if (disposed || frame !== null) return;
    frame = schedule(measure);
  };

  const Observer = root.defaultView?.ResizeObserver;
  const observer = Observer ? new Observer(queue) : null;
  observer?.observe(contentRoot);
  queue();

  return {
    measure,
    getSectionOutline,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (frame !== null) cancelSchedule(frame);
      frame = null;
    },
  };
};
