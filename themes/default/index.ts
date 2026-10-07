export const themeStyles = `
  :root {
    --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-serif: Georgia, 'Times New Roman', serif;
    --font-mono: 'Fira Code', Consolas, monospace;

    --color-bg: #ffffff;
    --color-surface: #f8f9fa;
    --color-border: #e9ecef;
    --color-text: #212529;
    --color-muted: #6c757d;
    --color-primary: #2271b1;
    --color-primary-hover: #135e96;

    --max-width: 740px;
    --header-height: 60px;

    --radius-sm: 3px;
    --radius-md: 6px;

    --shadow-sm: 0 1px 3px rgba(0,0,0,.08);
    --shadow-md: 0 4px 12px rgba(0,0,0,.12);
  }

  *, *::before, *::after { box-sizing: border-box; }

  html { font-size: 16px; -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    font-family: var(--font-sans);
    background: var(--color-bg);
    color: var(--color-text);
    line-height: 1.6;
  }

  a { color: var(--color-primary); }
  a:hover { color: var(--color-primary-hover); }

  img { max-width: 100%; height: auto; display: block; }

  /* Layout */
  .site-wrapper { max-width: var(--max-width); margin: 0 auto; padding: 0 20px; }

  /* Header */
  .site-header {
    border-bottom: 1px solid var(--color-border);
    height: var(--header-height);
    display: flex; align-items: center;
  }
  .site-header .site-wrapper {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
  }
  .site-branding a { text-decoration: none; color: var(--color-text); font-weight: 700; font-size: 1.2rem; }
  .site-description { font-size: 0.8rem; color: var(--color-muted); margin-top: 2px; }

  /* Nav */
  .site-nav { display: flex; gap: 0; list-style: none; margin: 0; padding: 0; }
  .site-nav a { padding: 8px 12px; text-decoration: none; font-size: 0.9rem; color: var(--color-muted); transition: color 0.15s; }
  .site-nav a:hover { color: var(--color-text); }

  /* Main */
  .site-main { padding: 48px 0; }

  /* Footer */
  .site-footer {
    border-top: 1px solid var(--color-border);
    padding: 24px 0; margin-top: 48px;
    font-size: 0.85rem; color: var(--color-muted); text-align: center;
  }

  /* Post list */
  .post-list { list-style: none; margin: 0; padding: 0; }
  .post-list-item { border-bottom: 1px solid var(--color-border); padding: 28px 0; }
  .post-list-item:first-child { padding-top: 0; }
  .post-list-item:last-child { border-bottom: none; }
  .post-list-item h2 { margin: 0 0 8px; font-size: 1.4rem; line-height: 1.3; }
  .post-list-item h2 a { text-decoration: none; color: var(--color-text); }
  .post-list-item h2 a:hover { color: var(--color-primary); }
  .post-meta { font-size: 0.82rem; color: var(--color-muted); margin-bottom: 10px; }
  .post-excerpt { margin: 0; color: var(--color-muted); font-size: 0.95rem; }
  .read-more { display: inline-block; margin-top: 10px; font-size: 0.85rem; }

  /* Single post */
  .post-header { margin-bottom: 32px; }
  .post-header h1 { margin: 0 0 10px; font-size: 2rem; line-height: 1.25; }
  .post-content { font-size: 1.05rem; line-height: 1.75; }
  .post-content h2 { font-size: 1.5rem; margin-top: 2rem; }
  .post-content h3 { font-size: 1.25rem; margin-top: 1.75rem; }
  .post-content p { margin: 0 0 1.25rem; }
  .post-content ul, .post-content ol { margin: 0 0 1.25rem; padding-left: 1.5rem; }
  .post-content blockquote { margin: 0 0 1.25rem; padding: 1rem 1.25rem; border-left: 4px solid var(--color-border); color: var(--color-muted); }
  .post-content pre { background: var(--color-surface); padding: 1rem; border-radius: var(--radius-md); overflow-x: auto; font-size: 0.875rem; }
  .post-content code { font-family: var(--font-mono); font-size: 0.875em; background: var(--color-surface); padding: 2px 5px; border-radius: var(--radius-sm); }
  .post-content pre code { background: none; padding: 0; }
  .post-content img { border-radius: var(--radius-md); margin: 1.5rem 0; }
  .wp-block-image { margin: 1.5rem 0; }
  .wp-block-image img { border-radius: var(--radius-md); }

  /* Pagination */
  .pagination { display: flex; gap: 6px; justify-content: center; margin-top: 40px; }
  .pagination a, .pagination span {
    padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    text-decoration: none; font-size: 0.875rem; color: var(--color-primary);
  }
  .pagination .current { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

  /* 404 */
  .not-found { text-align: center; padding: 80px 0; }
  .not-found h1 { font-size: 5rem; margin: 0; color: var(--color-border); }
  .not-found h2 { margin: 0 0 12px; }
`;
