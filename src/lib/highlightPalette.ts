export const highlightColors = [
  '#4f4600',
  '#14532d',
  '#6b214b',
  '#1e3a8a',
  '#fef08a',
  '#bbf7d0',
  '#fbcfe8',
  '#bfdbfe',
] as const;

export const highlightTextColors: Record<string, string> = {
  '#4f4600': '#f9fafb',
  '#14532d': '#f9fafb',
  '#6b214b': '#f9fafb',
  '#1e3a8a': '#f9fafb',
  '#fef08a': '#1f2937',
  '#bbf7d0': '#1f2937',
  '#fbcfe8': '#1f2937',
  '#bfdbfe': '#1f2937',
};

export const highlightTextColorCss = Object.entries(highlightTextColors)
  .map(([color, textColor]) => '.prose mark[style*="background-color: ' + color + '" i] { color: ' + textColor + '; }')
  .join('\n');
