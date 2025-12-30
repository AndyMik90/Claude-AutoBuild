/**
 * RTL (Right-to-Left) utilities for detecting and handling bidirectional text
 */

// RTL language codes and Unicode ranges
const RTL_LANGUAGES = new Set([
  'he', // Hebrew
  'ar', // Arabic
  'fa', // Persian/Farsi
  'ur', // Urdu
  'yi', // Yiddish
  'ji', // Yiddish (alternative code)
]);

// Unicode ranges for RTL characters
const RTL_RANGES = [
  [0x0590, 0x05FF], // Hebrew
  [0x0600, 0x06FF], // Arabic
  [0x0700, 0x074F], // Syriac
  [0x0750, 0x077F], // Arabic Supplement
  [0x0780, 0x07BF], // Thaana
  [0x07C0, 0x07FF], // N'Ko
  [0x0800, 0x083F], // Samaritan
  [0x08A0, 0x08FF], // Arabic Extended-A
  [0xFB1D, 0xFB4F], // Hebrew presentation forms
  [0xFB50, 0xFDFF], // Arabic presentation forms
  [0xFE70, 0xFEFF], // Arabic presentation forms
];

/**
 * Check if a character is RTL
 */
function isRTLChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return RTL_RANGES.some(([start, end]) => code >= start && code <= end);
}

/**
 * Detect if text contains significant RTL content
 * @param text - Text to analyze
 * @param threshold - Minimum percentage of RTL characters (0-1)
 * @returns true if text should be displayed RTL
 */
export function detectRTL(text: string, threshold = 0.3): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  // Remove whitespace and count only meaningful characters
  const meaningfulChars = text.replace(/\s+/g, '');
  if (meaningfulChars.length === 0) {
    return false;
  }

  // Count RTL characters
  let rtlCount = 0;
  for (const char of meaningfulChars) {
    if (isRTLChar(char)) {
      rtlCount++;
    }
  }

  // Check if RTL percentage exceeds threshold
  const rtlPercentage = rtlCount / meaningfulChars.length;
  return rtlPercentage >= threshold;
}

/**
 * Get text direction based on content
 */
export function getTextDirection(text: string): 'rtl' | 'ltr' {
  return detectRTL(text) ? 'rtl' : 'ltr';
}

/**
 * Detect if text starts with RTL character (for auto-direction)
 */
export function startsWithRTL(text: string): boolean {
  if (!text) return false;
  
  // Find first non-whitespace character
  const trimmed = text.trimStart();
  if (trimmed.length === 0) return false;
  
  return isRTLChar(trimmed[0]);
}

/**
 * Apply RTL styling classes based on text content
 */
export function getRTLClassName(text: string): string {
  const isRTL = detectRTL(text);
  return isRTL ? 'text-right rtl' : 'text-left ltr';
}

/**
 * Get dir attribute value for HTML elements
 */
export function getDirAttribute(text: string): 'rtl' | 'ltr' | 'auto' {
  // For mixed content, use auto
  const rtlChars = Array.from(text).filter(isRTLChar).length;
  const totalChars = text.replace(/\s+/g, '').length;
  
  if (totalChars === 0) return 'auto';
  
  const rtlRatio = rtlChars / totalChars;
  
  // Strong RTL presence
  if (rtlRatio > 0.5) return 'rtl';
  // Strong LTR presence
  if (rtlRatio < 0.1) return 'ltr';
  // Mixed content
  return 'auto';
}
