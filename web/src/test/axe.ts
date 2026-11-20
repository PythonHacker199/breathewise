import axe from 'axe-core';

/**
 * Run axe-core against rendered DOM and fail with a readable list of violations.
 * Colour contrast is excluded because jsdom does not compute styles; the palette is checked
 * separately (textOn() in lib/format.ts picks WCAG-contrasting text for every AQI colour).
 * `scope: 'component'` limits the run to WCAG rules, since a lone component has no page landmarks.
 */
export async function expectNoAxeViolations(
  container: Element,
  { scope = 'component' }: { scope?: 'component' | 'page' } = {},
) {
  const results = await axe.run(container, {
    ...(scope === 'component' && {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    }),
    rules: { 'color-contrast': { enabled: false } },
  });
  const report = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  if (report.length > 0) throw new Error(`Accessibility violations:\n${report.join('\n')}`);
}
