export type EmployeeShowcaseDraft = {
  badge: string;
  title: string;
  message: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | '';
};

export const EMPTY_EMPLOYEE_SHOWCASE: EmployeeShowcaseDraft = {
  badge: 'Employee Spotlight',
  title: '',
  message: '',
  mediaUrl: '',
  mediaType: ''
};

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const normalizeDraft = (draft?: Partial<EmployeeShowcaseDraft>): EmployeeShowcaseDraft => ({
  badge: String(draft?.badge || EMPTY_EMPLOYEE_SHOWCASE.badge).trim(),
  title: String(draft?.title || '').trim(),
  message: String(draft?.message || '').trim(),
  mediaUrl: String(draft?.mediaUrl || '').trim(),
  mediaType: draft?.mediaType === 'video' ? 'video' : draft?.mediaType === 'image' ? 'image' : ''
});

export const hasEmployeeShowcaseContent = (draft?: Partial<EmployeeShowcaseDraft>) => {
  const normalized = normalizeDraft(draft);
  return Boolean(normalized.title || normalized.message || normalized.mediaUrl);
};

export const buildEmployeeShowcaseHtml = (draft?: Partial<EmployeeShowcaseDraft>) => {
  const normalized = normalizeDraft(draft);
  if (!hasEmployeeShowcaseContent(normalized)) return '';

  const badge = escapeHtml(normalized.badge || EMPTY_EMPLOYEE_SHOWCASE.badge);
  const title = escapeHtml(normalized.title || 'Employee Update');
  const message = escapeHtml(normalized.message || '');
  const mediaUrl = escapeAttribute(normalized.mediaUrl);
  const mediaType = normalized.mediaType === 'video' ? 'video' : 'image';

  const mediaMarkup = normalized.mediaUrl
    ? mediaType === 'video'
      ? `<video class="h-full w-full object-cover" src="${mediaUrl}" autoplay loop muted playsinline controls></video>`
      : `<img class="h-full w-full object-cover" src="${mediaUrl}" alt="${title}" />`
    : `<div class="h-full w-full bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.38),transparent_30%),linear-gradient(135deg,#0f172a,#312e81,#0f172a)]"></div>`;

  return [
    `<section data-employee-showcase="true" data-badge="${escapeAttribute(normalized.badge)}" data-title="${escapeAttribute(normalized.title)}" data-message="${escapeAttribute(normalized.message)}" data-media-url="${escapeAttribute(normalized.mediaUrl)}" data-media-type="${mediaType}" class="not-prose overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">`,
    '  <div class="relative min-h-[320px] isolate">',
    `    <div class="absolute inset-0">${mediaMarkup}</div>`,
    '    <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(2,6,23,0.88),rgba(15,23,42,0.58),rgba(30,41,59,0.2))]"></div>',
    '    <div class="relative flex min-h-[320px] flex-col justify-end gap-4 p-6 md:p-10">',
    `      <span class="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-amber-100 backdrop-blur-md">${badge}</span>`,
    `      <h2 class="max-w-3xl text-3xl font-black tracking-[-0.05em] text-white md:text-5xl">${title}</h2>`,
    message ? `      <p class="max-w-3xl text-sm leading-7 text-slate-200 md:text-lg">${message.replace(/\n/g, '<br />')}</p>` : '',
    '    </div>',
    '  </div>',
    '</section>'
  ].filter(Boolean).join('\n');
};

export const extractEmployeeShowcaseDraft = (html?: string): EmployeeShowcaseDraft => {
  const raw = String(html || '').trim();
  if (!raw || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { ...EMPTY_EMPLOYEE_SHOWCASE };
  }

  try {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    const root = document.querySelector<HTMLElement>('[data-employee-showcase="true"]');
    if (!root) return { ...EMPTY_EMPLOYEE_SHOWCASE };

    const mediaTypeAttr = root.dataset.mediaType === 'video' ? 'video' : root.dataset.mediaType === 'image' ? 'image' : '';
    return {
      badge: root.dataset.badge || EMPTY_EMPLOYEE_SHOWCASE.badge,
      title: root.dataset.title || '',
      message: root.dataset.message || '',
      mediaUrl: root.dataset.mediaUrl || '',
      mediaType: mediaTypeAttr
    };
  } catch {
    return { ...EMPTY_EMPLOYEE_SHOWCASE };
  }
};
