/**
 * Language-independent data: dates, stack spans, contact details, technology tags.
 * Everything here is shown identically in every language.
 */

/** Time axis of the stack chart and the 3D tower, in decimal years. */
export const timeline = { start: 2003, end: 2027 } as const;

export interface StackSpan {
  name: string;
  from: number;
  to: number;
  /** printed span, e.g. "2021–26" */
  years: string;
  current: boolean;
  /**
   * label side in the 2D chart: before the bar (late starters), after it (2003 starters),
   * or inside it (a bar that spans the whole axis leaves no room on either side)
   */
  labelSide: 'before' | 'after' | 'inside';
  /** eras within the span, marked inside the bar (and as dots on the 3D branch) */
  segments?: { name: string; from: number; to: number; years: string }[];
}

/** Newest first, as in cv-onepage.html (.track --from / --to). */
export const stacks: StackSpan[] = [
  { name: 'Java Spring', from: 2021.75, to: 2026.58, years: '2021–26', current: true, labelSide: 'before' },
  { name: 'Angular', from: 2020.33, to: 2026.58, years: '2020–26', current: true, labelSide: 'before' },
  { name: 'React', from: 2018, to: 2020.33, years: '2018–20', current: false, labelSide: 'before' },
  { name: 'TypeScript', from: 2017, to: 2026.58, years: '2017–26', current: true, labelSide: 'before' },
  { name: '.NET · C#', from: 2015.25, to: 2021.83, years: '2015–21', current: false, labelSide: 'before' },
  { name: 'PHP · Symfony', from: 2003.67, to: 2017, years: '2003–16', current: false, labelSide: 'after' },
  { name: 'Flash · ActionScript', from: 2003.67, to: 2010.75, years: '2003–10', current: false, labelSide: 'after' },
  // under every other stack, from MySQL through Oracle PL/SQL and MSSQL to SQLite: drawn last, as the base
  {
    name: 'SQL',
    from: 2003.67,
    to: 2026.58,
    years: '2003–26',
    current: true,
    labelSide: 'inside',
    // MySQL with PHP; Oracle PL/SQL at AsystANT; MSSQL / T-SQL from Outlast to ROKSH; SQLite at CareDx
    segments: [
      { name: 'MySQL', from: 2003.67, to: 2013.42, years: '2003–13' },
      { name: 'Oracle', from: 2013.42, to: 2015.25, years: '2013–15' },
      { name: 'MSSQL', from: 2015.25, to: 2021.75, years: '2015–21' },
      { name: 'SQLite', from: 2021.75, to: 2026.58, years: '2021–26' },
    ],
  },
];

/** Seniority band under the chart; labels come from the language file in the same order. */
export const levelSpans: { from: number; to: number; current: boolean }[] = [
  { from: 2003.67, to: 2007.58, current: false },
  { from: 2007.58, to: 2012, current: false },
  { from: 2012, to: 2020.33, current: false },
  { from: 2020.33, to: 2026.58, current: true },
];

export const axisYears = [2005, 2010, 2015, 2020, 2025];

/**
 * Start of every role, in decimal years: the dots on the trunk of the 3D stack graph.
 * From 2013 on these are the months of the Experience section; the earlier ones are the
 * first year of each row of the Earlier ledger, which gives no months.
 */
export const roleStarts = [2003.67, 2008, 2009, 2010, 2011, 2012, 2013.42, 2015.25, 2017, 2019.25, 2020.33, 2021.75];

/** Headline numbers; labels are in the language files. */
export const stats = [23, 6, 3, 11] as const;

/**
 * Contact details, as printed on the CV. To take the phone number off the site,
 * set `phone` to null; the contact section and the hero adapt.
 */
export const contact: {
  phone: { display: string; href: string } | null;
  email: string;
  linkedin: { display: string; href: string };
  cvHref: string;
} = {
  phone: { display: '+36 70 328 1027', href: 'tel:+36703281027' },
  email: 'wonderlaw@protonmail.com',
  linkedin: { display: 'linkedin.com/in/tibornemeth78', href: 'https://www.linkedin.com/in/tibornemeth78/' },
  cvHref: '/Tibor_Nemeth_CV.pdf',
};

/** Selected work: years and tags per card, in the order of the language files' work.cards. */
export const workMeta: { years: string; tags: string[]; /** product or company website, opened in a new tab */ url?: string }[] = [
  { years: '2021–26', tags: ['Angular workspace', 'TypeScript', 'ThreeJS', 'Electron', 'Java Spring', 'SQLite', 'Cypress', 'Jest', 'Azure DevOps'], url: 'https://www.caredx.com/' },
  { years: '2020–21', tags: ['.NET Core 3.1', 'Azure', 'Angular 11', 'PWA', 'Revolut', 'Barion'], url: 'https://www.roksh.com/' },
  { years: '2019–20', tags: ['.NET Core 3.1', 'ASP.NET', 'WPF', 'SignalR', 'MSSQL', 'React'], url: 'https://10xone.hu/' },
  { years: '2017–19', tags: ['TypeScript', 'KnockoutJS', 'C# / .NET', 'Azure', 'MSSQL'], url: 'https://storiesonboard.com/' },
  { years: '2015–16', tags: ['PHP', 'JavaScript', 'ASP.NET', 'T-SQL', 'Node.js', 'Google Maps', 'SendGrid', 'Xero'], url: 'https://framework.outlast.io/introduction/' },
  { years: '2013–15', tags: ['Symfony', 'ExtJS', 'Oracle PL/SQL', 'REST'], url: 'https://www.asystant.hu/' },
  { years: '2010–11', tags: ['PHP5', 'Joomla (K2)', 'MySQL'], url: 'https://mindentudas.hu/' },
  { years: '2008–09', tags: ['PHP5', 'MySQL', 'Dojo', 'ExtJS'] },
];

/** Running technology marquee in the Skills section (all from the CV's skill groups). */
export const marquee = [
  'Angular', 'TypeScript', 'RxJS', 'Java Spring', '.NET Core', 'C#', 'React', 'Electron', 'Node.js',
  'ThreeJS', 'Azure', 'Azure DevOps', 'Docker', 'Cypress', 'Jest', 'SonarQube', 'MSSQL', 'Oracle PL/SQL',
  'SQLite', 'MySQL', 'PHP', 'Symfony', 'Git', 'Jira',
];

export const person = {
  given: 'Tibor',
  family: 'Németh',
};
