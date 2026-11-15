import type { SiteContent } from './types';

/** English copy. Wording follows cv-onepage.html; see plan.md, section 3. */
const en: SiteContent = {
  locale: 'en',
  htmlLang: 'en',
  ogLocale: 'en_GB',
  meta: {
    title: 'Tibor Németh — Full Stack Software Architect',
    description:
      'CV and portfolio of Tibor Németh, Full Stack Software Architect from Hungary: 23 years of web development, six stacks, most recently architect and team lead at CareDx.',
  },
  a11y: {
    skipLink: 'Skip to content',
    mainNav: 'Sections',
    languageSwitch: 'Language',
    switchTo: { en: 'English', hu: 'Magyar (Hungarian)' },
    scrollProgress: 'Reading progress',
    home: 'Tibor Németh, back to top',
  },
  nav: [
    { id: 'about', label: 'About' },
    { id: 'stacks', label: 'Stacks' },
    { id: 'experience', label: 'Experience' },
    { id: 'work', label: 'Work' },
    { id: 'skills', label: 'Skills' },
    { id: 'contact', label: 'Contact' },
  ],
  hero: {
    status: 'Open to new roles · remote or hybrid',
    nameLines: ['Tibor', 'Németh'],
    role: 'Full Stack Software Architect',
    tagline: '// and Ninja, of course',
    pitch:
      'Hands-on architect who sets the technical direction, leads the team and still ships code — most recently across <strong>three transplant-diagnostics products at CareDx</strong> (Nasdaq: CDNA).',
    ctaPrimary: 'Get in touch',
    ctaSecondary: 'See the experience',
    towerCaption: 'Six stacks, 2003–2026',
  },
  stats: {
    heading: 'At a glance',
    labels: [
      'years building\nfor the web',
      'years as architect\nand team lead',
      'medtech products,\nclient-side team lead',
      'years of\nremote-first work',
    ],
  },
  about: {
    kicker: 'About',
    heading: 'Architect who still ships code.',
    paragraph:
      'Full stack senior developer and architect from Hungary, building for the web since 2003. I started with Flash and PHP and moved through .NET to TypeScript, Angular and Java Spring: six stacks in 23 years. For the last six years I have worked as an architect and team lead, designing the system, leading an international team, reviewing code and mentoring, while still shipping code myself.',
    portraitAlt: 'Portrait of Tibor Németh',
    quote:
      '“I think you’re an expert, because I can’t remember any complex problem you could not solve properly. That’s what I call expert.”',
    quoteSource: '— One of my favourite bosses',
    leadershipTitle: 'Leadership',
    leadership: [
      'Architecture & technical direction',
      'Leading international, remote teams',
      'Mentoring & code review',
      'Working with management & stakeholders',
    ],
    languagesTitle: 'Languages',
    languages: [
      { name: 'Hungarian', level: 'Native' },
      { name: 'English', level: 'Professional · daily use' },
    ],
  },
  stacks: {
    kicker: 'Timeline',
    heading: 'Six stacks in 23 years',
    intro:
      'From Flash and PHP through .NET to TypeScript, Angular and Java Spring. Each bar is the span between the first and the last role that used the stack.',
    legendCurrent: 'current',
    legendEarlier: 'earlier',
    levelsTitle: 'Seniority by job title',
    levels: ['Junior', 'Developer', 'Senior · Lead', 'Architect'],
    figureLabel: 'Timeline of six technology stacks from 2003 to 2026',
  },
  experience: {
    kicker: 'Experience',
    heading: 'Thirteen years, six roles',
    jobs: [
      {
        title: 'Full Stack Software Architect',
        org: 'CareDx, Inc.',
        orgNote: 'transplant diagnostics, Nasdaq: CDNA',
        when: 'Oct 2021 – Jul 2026',
        length: '4 yrs 10 mos',
        current: true,
        points: [
          '<b>Led the international team</b> building the client applications of three products: Assign, Score and Surveillance (HCT, cfDNA).',
          '<b>Owned the architecture from design to release</b> — one Angular workspace shared by all three products, ThreeJS visualisations, Electron desktop builds and Java Spring services.',
          '<b>Kept the codebase healthy for five years</b> with code reviews, Cypress and Jest test suites, SonarQube and Azure DevOps pipelines.',
          '<b>Mentored team members</b> and worked directly with management.',
        ],
      },
      {
        title: 'Full Stack Developer & Architect',
        org: 'ROKSH',
        orgNote: 'grocery delivery platform, ALDI Hungary’s partner',
        when: 'May 2020 – Oct 2021',
        length: '1 yr 6 mos',
        points: [
          '<b>Planned the architecture and led development</b> of the Delivery and Provider manager platforms: .NET Core services on Azure, Angular 11 PWAs and shared libraries.',
          '<b>Integrated payments and third-party services</b> (Revolut, Barion, Google APIs, Bugsnag) and ran CI/CD and deployment.',
        ],
      },
      {
        title: 'Senior Full Stack Developer',
        org: 'Freelance',
        orgNote: 'ERP and web clients',
        when: 'Apr 2019 – Apr 2020',
        length: '1 yr 1 mo',
        desc: 'Maintained and extended the <b>10XOne ERP</b> (.NET Core, WPF, SignalR, MSSQL). Before that, built JAMstack sites, reactive web apps and Electron desktop apps with React, Gatsby and Firebase.',
      },
      {
        title: 'Full Stack Web Application Developer',
        org: 'DevMads Ltd.',
        orgNote: 'StoriesOnBoard, story-mapping SaaS',
        when: 'Jan 2017 – Apr 2019',
        length: '2 yrs 4 mos',
        desc: 'Built single-page app features for <b>StoriesOnBoard</b>, an industry-leading story mapping tool: TypeScript, KnockoutJS, C# / .NET, Azure.',
      },
      {
        title: 'Senior Full Stack Web Developer',
        org: 'Outlast Web & Mobile Development',
        orgNote: 'agency, remote',
        when: 'Apr 2015 – Dec 2016',
        length: '1 yr 9 mos',
        desc: 'Remote work on the <b>Outlast Framework</b> (PHP, JavaScript) and the <b>Iceberg</b> platform (ASP.NET, T-SQL), integrating Google Maps, SendGrid and Xero.',
      },
      {
        title: 'Senior Web Developer',
        org: 'AsystANT Ltd.',
        orgNote: 'GPS fleet tracking',
        when: 'Jun 2013 – Jan 2015',
        length: '1 yr 8 mos',
        desc: 'Web and database development for a <b>GPS-based fleet tracking</b> product on web and desktop: Symfony, ExtJS, Oracle PL/SQL, REST APIs.',
      },
    ],
  },
  work: {
    kicker: 'Selected work',
    heading: 'Products I built',
    intro: 'Eight products from 2008 to 2026: what each one is, and what it runs on.',
    newTab: '(opens the website in a new tab)',
    cards: [
      {
        name: 'Assign · Score · Surveillance',
        company: 'CareDx',
        role: 'Architect · team lead',
        sentence:
          'Client applications of three transplant-diagnostics products in one shared Angular workspace, with ThreeJS visualisations and Electron desktop builds on Java Spring services.',
      },
      {
        name: 'Delivery & Provider manager platforms',
        company: 'ROKSH',
        role: 'Architect · lead developer',
        sentence:
          'Platforms for a grocery delivery service, ALDI Hungary’s partner: .NET Core services on Azure, Angular PWAs and payment integrations.',
      },
      {
        name: '10XOne ERP',
        company: 'Freelance',
        role: 'Senior full stack .NET developer',
        sentence: 'Maintaining existing functionality, and researching and implementing new features, in the 10XOne ERP.',
      },
      {
        name: 'StoriesOnBoard',
        company: 'DevMads',
        role: 'Full stack developer',
        sentence: 'Single-page application development for an industry-leading story mapping tool.',
      },
      {
        name: 'Iceberg & Outlast Framework',
        company: 'Outlast',
        role: 'Senior full stack developer · remote',
        sentence:
          'An agency’s own PHP and JavaScript framework and an ASP.NET platform, with many API integrations: Google Maps, SendGrid, Postmark, Xero, ACHWorks.',
      },
      {
        name: 'GPS fleet tracking',
        company: 'AsystANT',
        role: 'Senior web developer',
        sentence:
          'A GPS-based vehicle fleet tracking application for web and desktop, with Oracle, ExtJS and Symfony under the hood.',
      },
      {
        name: 'University of Omniscience portal',
        company: 'Mindentudás Egyeteme',
        role: 'Joomla CMS developer',
        sentence: 'Web portal of the well-known Hungarian science TV programme, built on Joomla.',
      },
      {
        name: 'Website-builder application',
        company: 'Megaweb',
        role: 'PHP developer',
        sentence: 'A custom, commercial online website maker on the company’s own PHP framework (“mayaFish”).',
      },
    ],
  },
  skills: {
    kicker: 'Core skills',
    heading: 'The toolbox',
    groups: [
      { title: 'Front end', items: '<b>Angular · TypeScript · RxJS</b> · React · Electron' },
      { title: 'Back end', items: '<b>Java Spring · .NET Core / C#</b> · Node.js · PHP' },
      { title: 'Data', items: 'MSSQL · MySQL · Oracle PL/SQL · SQLite' },
      { title: 'Cloud & delivery', items: '<b>Azure · Azure DevOps</b> · Docker · CI/CD · Netlify' },
      { title: 'Quality & workflow', items: 'Cypress · Jest · SonarQube · Git / GitHub · npm · Jira' },
    ],
    marqueeLabel: 'Technologies',
  },
  earlier: {
    kicker: 'Earlier · 2003–2013',
    heading: 'Where it started',
    rows: [
      { years: '2012–13', name: 'GBaRT', what: 'Lead Web Developer' },
      { years: '2011–12', name: 'Freelance', what: 'Joomla, Yii, Symfony 2' },
      { years: '2010–11', name: 'Mindentudás Egyeteme', what: 'TV portal' },
      { years: '2009–10', name: 'Colabs', what: 'freelance, Flash / Flex, PHP' },
      { years: '2008–09', name: 'Megaweb', what: 'PHP, website-builder app' },
      { years: '2008', name: 'Ogilvy / Redworks', what: 'campaign web apps' },
      { years: '2003–07', name: 'Junior web developer', what: 'amstudio, EnterSion, Webvilág, Egedesign' },
    ],
  },
  contact: {
    kicker: 'Contact',
    heading: 'Let’s talk.',
    line: 'Feel free to get in touch directly.',
    phoneNote: 'Signal',
    location: 'Marcali, Hungary',
    timezoneNote: 'CET',
    cv: 'Download the CV',
    cvNote: 'PDF · one page',
    labels: { phone: 'Phone', email: 'Email', linkedin: 'LinkedIn', location: 'Location' },
  },
  footer: { builtWith: 'Built with Astro · three.js · Danet' },
  notFound: {
    title: 'Page not found',
    text: 'This page does not exist. The CV is one page, and it is here:',
    back: 'Back to the CV',
  },
};

export default en;
