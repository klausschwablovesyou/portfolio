/**
 * The shape every language file must satisfy. A key missing from en.ts or hu.ts fails
 * `astro check` / the build, so nothing ships untranslated.
 *
 * Strings marked "HTML" may contain <b>, <strong> and <em>; they are rendered with set:html.
 * Everything else is plain text.
 */
export type Locale = 'en' | 'hu';

export interface NavItem {
  /** id of the section the link points to */
  id: string;
  label: string;
}

export interface Job {
  title: string;
  org: string;
  orgNote: string;
  /** e.g. "Oct 2021 – Jul 2026" */
  when: string;
  /** e.g. "4 yrs 10 mos" */
  length: string;
  /** HTML. Either bullet points or a single description paragraph. */
  points?: string[];
  desc?: string;
  current?: boolean;
}

export interface WorkCard {
  name: string;
  company: string;
  role: string;
  /** one sentence about the product */
  sentence: string;
}

export interface SiteContent {
  locale: Locale;
  /** BCP 47 tag for <html lang> */
  htmlLang: string;
  /** Open Graph locale, e.g. en_GB */
  ogLocale: string;
  meta: { title: string; description: string };
  a11y: {
    skipLink: string;
    mainNav: string;
    languageSwitch: string;
    /** "Switch to English" style label, keyed by target locale */
    switchTo: Record<Locale, string>;
    scrollProgress: string;
    home: string;
  };
  nav: NavItem[];
  hero: {
    status: string;
    /** two lines; the second is set in amber */
    nameLines: [string, string];
    role: string;
    tagline: string;
    /** HTML */
    pitch: string;
    ctaPrimary: string;
    ctaSecondary: string;
    towerCaption: string;
  };
  stats: {
    heading: string;
    /** labels in the order of shared.stats; "\n" marks the preferred line break */
    labels: [string, string, string, string];
  };
  about: {
    kicker: string;
    heading: string;
    paragraph: string;
    portraitAlt: string;
    quote: string;
    quoteSource: string;
    leadershipTitle: string;
    leadership: string[];
    languagesTitle: string;
    languages: { name: string; level: string }[];
  };
  stacks: {
    kicker: string;
    heading: string;
    intro: string;
    legendCurrent: string;
    legendEarlier: string;
    levelsTitle: string;
    /** Junior, Developer, Senior · Lead, Architect */
    levels: [string, string, string, string];
    figureLabel: string;
  };
  experience: {
    kicker: string;
    heading: string;
    jobs: Job[];
  };
  work: {
    kicker: string;
    heading: string;
    intro: string;
    /** screen-reader hint after a card's link: the site opens in a new tab */
    newTab: string;
    cards: WorkCard[];
  };
  skills: {
    kicker: string;
    heading: string;
    /** HTML items; <b> marks the core ones */
    groups: { title: string; items: string }[];
  };
  earlier: {
    kicker: string;
    heading: string;
    rows: { years: string; name: string; what: string }[];
  };
  contact: {
    kicker: string;
    heading: string;
    line: string;
    phoneNote: string;
    location: string;
    timezoneNote: string;
    cv: string;
    cvNote: string;
    labels: { phone: string; email: string; linkedin: string; location: string };
  };
  footer: { builtWith: string };
  notFound: { title: string; text: string; back: string };
}
