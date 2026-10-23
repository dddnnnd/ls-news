import { supabase } from './supabase-client.js';

const grid = document.querySelector('#news-grid');
const latest = document.querySelector('#latest-news');
const categoryMenu = document.querySelector('.nav');
let selectedNewsCategory = 'all';

function setTickerGroup(group, banner) {
  group.textContent = banner.message;
}

async function loadSiteBanners() {
  const { data, error } = await supabase
    .from('lsn_site_banners')
    .select('banner_key, label, message, is_active')
    .eq('is_active', true);
  if (error) return;
  const banners = data || [];

  const ticker = banners.find((banner) => banner.banner_key === 'ticker');
  const tickerBar = document.querySelector('#breaking-ticker');
  if (tickerBar) {
    tickerBar.hidden = false;
    if (ticker) {
      document.querySelector('#breaking-ticker-label').textContent = ticker.label;
      setTickerGroup(document.querySelector('#ticker-primary'), ticker);
      setTickerGroup(document.querySelector('#ticker-copy'), ticker);
    }
  }

  const ad = banners.find((banner) => banner.banner_key === 'ad');
  const adSection = document.querySelector('#site-ad-banner');
  if (adSection) adSection.hidden = !ad;
  if (ad && adSection) {
    document.querySelector('#site-ad-message').textContent = ad.message;
  }

  const marquee = banners.find((banner) => banner.banner_key === 'marquee');
  const marqueeSection = document.querySelector('#site-marquee');
  if (marqueeSection) marqueeSection.hidden = !marquee;
  if (marquee && marqueeSection) {
    const text = `${marquee.message} • `;
    for (const id of ['site-marquee-primary', 'site-marquee-copy']) {
      document.querySelector(`#${id}`).textContent = text.repeat(2);
    }
    marqueeSection.hidden = false;
  }
}

window.addEventListener('lsn-banner-refresh', loadSiteBanners);

const heroScene = document.querySelector('#hero-scene');
const heroHelicopter = heroScene?.querySelector('.heli');
let pointerFrame = 0;
let pointerPosition = { x: 0, y: 0 };
let helicopterOffset = { x: 0, y: 0 };
let helicopterDrag = null;

heroHelicopter?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  helicopterDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: helicopterOffset.x,
    offsetY: helicopterOffset.y,
  };
  heroHelicopter.classList.add('is-dragging');
  heroHelicopter.setPointerCapture(event.pointerId);
});

heroScene?.addEventListener('pointermove', (event) => {
  if (!heroHelicopter) return;
  if (helicopterDrag?.pointerId === event.pointerId) {
    const bounds = heroScene.getBoundingClientRect();
    const limitX = Math.min(420, bounds.width * 0.38);
    const limitY = Math.min(260, bounds.height * 0.34);
    helicopterOffset = {
      x: Math.max(-limitX, Math.min(limitX, helicopterDrag.offsetX + event.clientX - helicopterDrag.startX)),
      y: Math.max(-limitY, Math.min(limitY, helicopterDrag.offsetY + event.clientY - helicopterDrag.startY)),
    };
    heroHelicopter.style.setProperty('--heli-pointer-x', `${helicopterOffset.x}px`);
    heroHelicopter.style.setProperty('--heli-pointer-y', `${helicopterOffset.y}px`);
    return;
  }
  if (event.pointerType !== 'mouse') return;
  const bounds = heroScene.getBoundingClientRect();
  pointerPosition = {
    x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)),
    y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)),
  };
  if (pointerFrame) return;
  pointerFrame = window.requestAnimationFrame(() => {
    helicopterOffset = { x: pointerPosition.x * 26, y: pointerPosition.y * 16 };
    heroHelicopter.style.setProperty('--heli-pointer-x', `${helicopterOffset.x}px`);
    heroHelicopter.style.setProperty('--heli-pointer-y', `${helicopterOffset.y}px`);
    pointerFrame = 0;
  });
});

function finishHelicopterDrag(event) {
  if (!heroHelicopter || helicopterDrag?.pointerId !== event.pointerId) return;
  helicopterDrag = null;
  heroHelicopter.classList.remove('is-dragging');
  if (heroHelicopter.hasPointerCapture(event.pointerId)) {
    heroHelicopter.releasePointerCapture(event.pointerId);
  }
}

heroHelicopter?.addEventListener('pointerup', finishHelicopterDrag);
heroHelicopter?.addEventListener('pointercancel', finishHelicopterDrag);

heroScene?.addEventListener('pointerleave', () => {
  if (!heroHelicopter || helicopterDrag) return;
  helicopterOffset = { x: 0, y: 0 };
  heroHelicopter.style.setProperty('--heli-pointer-x', '0px');
  heroHelicopter.style.setProperty('--heli-pointer-y', '0px');
});

function makeCard(article) {
  const link = document.createElement('a');
  link.className = 'tile rv';
  link.href = `article.html?id=${encodeURIComponent(article.id)}`;
  link.dataset.articleId = article.id;
  link.dataset.category = article.category;
  const background = document.createElement('div');
  background.className = 'bg';
  background.style.background = article.image_url
    ? `linear-gradient(180deg,#08080a00 15%,#08080ae8 100%),url("${article.image_url}") center/cover`
    : 'linear-gradient(145deg,#16405a,#08080a 80%)';
  const content = document.createElement('div');
  content.className = 'in';
  const category = document.createElement('div');
  category.className = 'kick';
  category.style.color = '#4aa3ff';
  category.textContent = article.category;
  const title = document.createElement('div');
  title.className = 't ser';
  title.style.cssText = 'font-size:22px;line-height:1.15;font-weight:700';
  title.textContent = article.title;
  const excerpt = document.createElement('p');
  excerpt.style.cssText = 'margin-top:10px;color:#a0a0a5;font-size:14px;line-height:1.5';
  excerpt.textContent = article.excerpt;
  const meta = document.createElement('span');
  meta.className = 'tile-meta';
  const publishedAt = article.published_at || article.created_at;
  const formattedDate = publishedAt
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(publishedAt))
    : '';
  meta.textContent = [article.author_name && `Автор: ${article.author_name}`, formattedDate].filter(Boolean).join(' · ');
  content.append(category, title, excerpt, meta);
  link.append(background, content);
  return link;
}

function makeLatest(article) {
  const link = document.createElement('a');
  link.className = 'row';
  link.href = `article.html?id=${encodeURIComponent(article.id)}`;
  link.dataset.articleId = article.id;
  link.dataset.category = article.category;
  const title = document.createElement('span');
  title.style.cssText = 'font-size:19px;line-height:1.35';
  title.textContent = article.title;
  const category = document.createElement('span');
  category.style.cssText = 'color:#8a8a8f;min-width:72px';
  category.textContent = article.category;
  link.append(category, title);
  return link;
}

function renderCategoryPreviews(articles) {
  for (const preview of document.querySelectorAll('[data-nav-preview]')) {
    const category = preview.dataset.navPreview;
    const matches = category === 'all'
      ? articles
      : articles.filter((article) => article.category === category);
    preview.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('span');
      empty.textContent = 'Пока нет опубликованных материалов.';
      preview.append(empty);
      continue;
    }
    for (const article of matches.slice(0, 3)) {
      const link = document.createElement('a');
      link.href = `article.html?id=${encodeURIComponent(article.id)}`;
      link.dataset.articleId = article.id;
      link.textContent = article.title;
      preview.append(link);
    }
  }
}

function filterNews(category = 'all') {
  selectedNewsCategory = category;
  const status = document.querySelector('#news-filter-status');
  if (status) status.textContent = category === 'all' ? 'Все опубликованные материалы' : `Рубрика: ${category}`;
  let visible = 0;
  for (const article of document.querySelectorAll('#news-grid .tile')) {
    article.hidden = category !== 'all' && article.dataset.category !== category;
    if (!article.hidden) visible += 1;
  }
  for (const article of document.querySelectorAll('#latest-news .row')) {
    article.hidden = category !== 'all' && article.dataset.category !== category;
  }
  let empty = document.querySelector('#news-filter-empty');
  if (!empty) {
    empty = document.createElement('p');
    empty.id = 'news-filter-empty';
    empty.className = 'news-filter-empty';
    empty.hidden = true;
    document.querySelector('#news-grid')?.append(empty);
  }
  empty.hidden = visible > 0;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-category-filter]');
  if (!link) return;
  const category = link.dataset.categoryFilter;
  for (const item of categoryMenu?.querySelectorAll('a[data-category-filter]') || []) {
    if (item === link) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  filterNews(category);
});

const bannerLoading = loadSiteBanners();

const { data, error } = await supabase
  .from('lsn_articles')
  .select('id, title, category, excerpt, image_url, author_name, published_at, created_at')
  .eq('status', 'published')
  .order('published_at', { ascending: false })
  .limit(12);

if (grid && latest) {
  grid.replaceChildren();
  latest.replaceChildren();
  if (error || !data?.length) {
    const empty = document.createElement('p');
    empty.textContent = error
      ? 'Публикации временно недоступны. Проверьте настройки Supabase и SQL-схему.'
      : 'Редакция готовит первые публикации.';
    grid.append(empty);
    latest.append(empty.cloneNode(true));
  } else {
    for (const article of data) {
      grid.append(makeCard(article));
      latest.append(makeLatest(article));
    }
  }
  renderCategoryPreviews(data || []);
  filterNews(selectedNewsCategory);
}

await bannerLoading;

const articleDialog = document.querySelector('#article-dialog');
const articleModalMessage = document.querySelector('#modal-article-message');

async function openArticleDialog(articleId) {
  articleDialog.showModal();
  articleModalMessage.textContent = 'Загружаем материал…';
  document.querySelector('#modal-article-title').textContent = '';
  document.querySelector('#modal-article-category').textContent = '';
  document.querySelector('#modal-article-author').textContent = '';
  document.querySelector('#modal-article-date').textContent = '';
  document.querySelector('#modal-article-excerpt').textContent = '';
  document.querySelector('#modal-article-body').textContent = '';
  const cover = document.querySelector('#modal-article-cover');
  cover.hidden = true;
  cover.removeAttribute('src');

  const { data: article, error: articleError } = await supabase
    .from('lsn_articles')
    .select('title, category, excerpt, body, image_url, author_name, published_at, created_at')
    .eq('id', articleId)
    .eq('status', 'published')
    .maybeSingle();

  if (articleError || !article) {
    articleModalMessage.textContent = articleError?.message || 'Статья снята с публикации или не найдена.';
    return;
  }

  document.querySelector('#modal-article-title').textContent = article.title;
  document.querySelector('#modal-article-category').textContent = article.category;
  document.querySelector('#modal-article-author').textContent = `Автор: ${article.author_name || 'Редакция Los Santos News'}`;
  const publishedDate = article.published_at || article.created_at;
  if (publishedDate) {
    const date = document.querySelector('#modal-article-date');
    date.dateTime = publishedDate;
    date.textContent = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(publishedDate));
  }
  if (article.image_url) {
    cover.src = article.image_url;
    cover.alt = `Обложка: ${article.title}`;
    cover.hidden = false;
  }
  document.querySelector('#modal-article-excerpt').textContent = article.excerpt;
  document.querySelector('#modal-article-body').textContent = article.body;
  articleModalMessage.textContent = '';
}

function handleArticleLink(event) {
  const link = event.target.closest('a[data-article-id]');
  if (!link) return;
  event.preventDefault();
  openArticleDialog(link.dataset.articleId);
}

grid?.addEventListener('click', handleArticleLink);
latest?.addEventListener('click', handleArticleLink);
categoryMenu?.addEventListener('click', handleArticleLink);
document.querySelector('#modal-article-close').addEventListener('click', () => articleDialog.close());
articleDialog.addEventListener('click', (event) => {
  if (event.target === articleDialog) articleDialog.close();
});
articleDialog.addEventListener('close', () => {
  const currentUrl = new URL(location.href);
  if (!currentUrl.searchParams.has('article')) return;
  currentUrl.searchParams.delete('article');
  history.replaceState(null, '', currentUrl);
});

const linkedArticleId = new URLSearchParams(location.search).get('article');
if (linkedArticleId) openArticleDialog(linkedArticleId);
