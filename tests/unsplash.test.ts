import { describe, it, expect } from 'vitest';
import {
  isUnsplashImageUrl,
  isUnsplashPhotoPageUrl,
  withUnsplashSize,
  slugifyImageName,
  searchQueryFromPrompt,
} from '@/lib/images/unsplash';
import { applyUnsplashToHtml, isPendingUnsplashImage } from '@/lib/images/rewrite';
import { sanitizeGeneratedHtml } from '@/lib/ai/sanitize';

describe('isUnsplashImageUrl', () => {
  it('accepts images.unsplash.com URLs', () => {
    expect(isUnsplashImageUrl('https://images.unsplash.com/photo-123?ixid=abc')).toBe(true);
    expect(isUnsplashImageUrl('https://plus.images.unsplash.com/photo-123')).toBe(true);
  });

  it('rejects other hosts and empty strings', () => {
    expect(isUnsplashImageUrl('https://unsplash.com/photos/abc')).toBe(false);
    expect(isUnsplashImageUrl('https://evil.example/unsplash.jpg')).toBe(false);
    expect(isUnsplashImageUrl('')).toBe(false);
  });
});

describe('isUnsplashPhotoPageUrl', () => {
  it('matches photo pages only', () => {
    expect(isUnsplashPhotoPageUrl('https://unsplash.com/photos/abc123')).toBe(true);
    expect(isUnsplashPhotoPageUrl('https://images.unsplash.com/photo-1')).toBe(false);
  });
});

describe('withUnsplashSize', () => {
  const RAW = 'https://images.unsplash.com/photo-1461988320302?ixid=M3wxMDg&ixlib=rb-4.0';

  it('adds width/height while preserving tracking params', () => {
    const out = withUnsplashSize(RAW, 1200, 630);
    expect(out).toContain('w=1200');
    expect(out).toContain('h=630');
    expect(out).toContain('fit=crop');
    expect(out).toContain('ixid=M3wxMDg'); // REQUIRED by the API guidelines
    expect(out).toContain('ixlib=rb-4.0');
  });

  it('does not overwrite existing quality/format params', () => {
    const out = withUnsplashSize(RAW + '&q=75&auto=jpeg', 800);
    expect(out).toContain('q=75');
    expect(out).toContain('auto=jpeg');
  });

  it('leaves non-Unsplash URLs untouched', () => {
    const url = 'https://example.com/photo.jpg';
    expect(withUnsplashSize(url, 100)).toBe(url);
  });

  it('handles URLs without query strings', () => {
    const out = withUnsplashSize('https://images.unsplash.com/photo-1', 400);
    expect(out).toContain('w=400');
    expect(out).toContain('q=80');
  });
});

describe('slugifyImageName / searchQueryFromPrompt', () => {
  it('slugs prompts to filesystem-safe names', () => {
    expect(slugifyImageName('Ceramic Mug, Sunlit!')).toBe('ceramic-mug-sunlit');
    expect(slugifyImageName('')).toBe('image');
  });

  it('strips filler words for a focused search query', () => {
    const q = searchQueryFromPrompt('a photo of a ceramic mug with soft shadows on the table');
    expect(q).not.toContain(' with ');
    expect(q).not.toContain(' the ');
    expect(q).toContain('ceramic');
    expect(q).toContain('mug');
  });
});

describe('applyUnsplashToHtml (sanitize pipeline pass)', () => {
  it('marks model-requested placeholder images as pending resolution', () => {
    const html =
      '<img src="https://picsum.photos/seed/x/800/600" data-image-prompt="ceramic coffee mug" alt="mug" width="800" height="600">';
    const out = applyUnsplashToHtml(html);
    expect(out).toContain('data-unsplash-pending="1"');
    expect(out).toContain('data-image-prompt="ceramic coffee mug"');
  });

  it('leaves already-resolved Unsplash images untouched', () => {
    const html =
      '<img src="https://images.unsplash.com/photo-123?ixid=x" data-image-prompt="mug" alt="mug">';
    expect(applyUnsplashToHtml(html)).toBe(html);
  });

  it('leaves user-pasted URLs untouched', () => {
    const html = '<img src="https://example.com/custom.jpg" alt="custom">';
    expect(applyUnsplashToHtml(html)).toBe(html);
  });
});

describe('sanitizeGeneratedHtml image integration', () => {
  it('normalizes data-ik-prompt (legacy) into the pending marker flow', () => {
    const html = '<img src="https://picsum.photos/seed/x/400/300" data-ik-prompt="old mug">';
    const out = sanitizeGeneratedHtml(html);
    expect(out).not.toContain('data-ik-prompt');
    expect(out).toContain('data-unsplash-pending');
  });

  it('keeps real Unsplash hotlinks intact', () => {
    const url = 'https://images.unsplash.com/photo-9?ixid=keepme&w=800&fit=crop';
    const out = sanitizeGeneratedHtml(`<img src="${url}" alt="latte">`);
    expect(out).toContain(url);
  });
});

describe('isPendingUnsplashImage', () => {
  it('identifies pending tags only', () => {
    expect(
      isPendingUnsplashImage('<img data-unsplash-pending="1" data-image-prompt="mug" src="x">')
    ).toBe(true);
    expect(isPendingUnsplashImage('<img src="https://images.unsplash.com/p">')).toBe(false);
  });
});
