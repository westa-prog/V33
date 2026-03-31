import React, { useMemo } from 'react';

interface LandingContentProps {
  html?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

const sanitizeLandingHtml = (value: string) => value
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  .replace(/<\/?(iframe|object|embed|link|meta)[^>]*>/gi, '')
  .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
  .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, ' $1="#"');

export const LandingContent: React.FC<LandingContentProps> = ({ html, title, subtitle, compact = false }) => {
  const safeHtml = useMemo(() => sanitizeLandingHtml(String(html || '').trim()), [html]);

  if (!safeHtml) return null;

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 ${compact ? 'p-5' : 'p-6 md:p-8'}`}>
      {(title || subtitle) && (
        <div className="mb-4 space-y-1">
          {title && <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      )}

      <div
        className={[
          'text-sm leading-7 text-slate-700 dark:text-slate-200',
          '[&_h1]:text-3xl [&_h1]:font-black [&_h1]:tracking-tight [&_h1]:text-slate-950 dark:[&_h1]:text-white',
          '[&_h2]:text-2xl [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:text-slate-950 dark:[&_h2]:text-white',
          '[&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-900 dark:[&_h3]:text-white',
          '[&_p]:my-3',
          '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_a]:font-semibold [&_a]:text-indigo-600 hover:[&_a]:text-indigo-500 dark:[&_a]:text-indigo-300',
          '[&_figure]:my-5 [&_figure]:space-y-3',
          '[&_figcaption]:text-xs [&_figcaption]:font-medium [&_figcaption]:uppercase [&_figcaption]:tracking-[0.18em] [&_figcaption]:text-slate-400',
          '[&_img]:w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 [&_img]:bg-slate-100 dark:[&_img]:border-slate-700 dark:[&_img]:bg-slate-950',
          '[&_video]:w-full [&_video]:rounded-2xl [&_video]:border [&_video]:border-slate-200 [&_video]:bg-slate-950 dark:[&_video]:border-slate-700'
        ].join(' ')}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
};
