import type { SiteContent } from './types';

/**
 * Hungarian copy, translated from en.ts. Not proofread yet by the owner.
 * Rules (plan.md, section 3): name order "Németh Tibor"; no direct address of the reader;
 * technology names and established developer terms stay in English; spaced en dash.
 */
const hu: SiteContent = {
  locale: 'hu',
  htmlLang: 'hu',
  ogLocale: 'hu_HU',
  meta: {
    title: 'Németh Tibor — Full stack szoftverarchitekt',
    description:
      'Németh Tibor full stack szoftverarchitekt önéletrajza és portfóliója: 23 év webfejlesztés, hat stack, legutóbb architekt és csapatvezető a CareDx-nél.',
  },
  a11y: {
    skipLink: 'Ugrás a tartalomhoz',
    mainNav: 'Szakaszok',
    languageSwitch: 'Nyelv',
    switchTo: { en: 'English (angol)', hu: 'Magyar' },
    scrollProgress: 'Olvasási előrehaladás',
    home: 'Németh Tibor, vissza az oldal tetejére',
  },
  nav: [
    { id: 'about', label: 'Rólam' },
    { id: 'stacks', label: 'Stackek' },
    { id: 'experience', label: 'Tapasztalat' },
    { id: 'work', label: 'Munkák' },
    { id: 'skills', label: 'Készségek' },
    { id: 'contact', label: 'Kapcsolat' },
  ],
  hero: {
    status: 'Új kihívásra nyitott · remote vagy hibrid',
    nameLines: ['Németh', 'Tibor'],
    role: 'Full stack szoftverarchitekt',
    tagline: '// és persze nindzsa',
    pitch:
      'Gyakorlatias architekt, aki kijelöli a technikai irányt, vezeti a csapatot, és közben maga is kódol – legutóbb a <strong>CareDx három transzplantációs diagnosztikai termékén</strong> (Nasdaq: CDNA).',
    ctaPrimary: 'Kapcsolat',
    ctaSecondary: 'Szakmai tapasztalat',
    towerCaption: 'Hat stack, 2003–2026',
  },
  stats: {
    heading: 'Számokban',
    labels: [
      'év webes\nfejlesztés',
      'év architektként\nés csapatvezetőként',
      'medtech termék,\nkliensoldali csapatvezetés',
      'év\nremote-first munka',
    ],
  },
  about: {
    kicker: 'Rólam',
    heading: 'Architekt, aki ma is kódol.',
    paragraph:
      'Full stack senior fejlesztő és architekt vagyok Magyarországról, 2003 óta fejlesztek webre. Flash-sel és PHP-val kezdtem, majd a .NET-en át jutottam el a TypeScripthez, az Angularhoz és a Java Springhez: hat stack 23 év alatt. Az elmúlt hat évben architektként és csapatvezetőként dolgoztam: rendszert terveztem, nemzetközi csapatot vezettem, code review-t végeztem és mentoráltam – miközben magam is folyamatosan kódoltam.',
    portraitAlt: 'Németh Tibor portréja',
    quote:
      '„Szerintem szakértő vagy, mert nem emlékszem olyan összetett problémára, amit ne oldottál volna meg rendesen. Ezt hívom én szakértőnek.”',
    quoteSource: '— Az egyik kedvenc főnököm',
    leadershipTitle: 'Vezetés',
    leadership: [
      'Architektúra és technikai irány',
      'Nemzetközi, remote csapatok vezetése',
      'Mentorálás és code review',
      'Együttműködés a vezetőséggel és az érintettekkel',
    ],
    languagesTitle: 'Nyelvek',
    languages: [
      { name: 'Magyar', level: 'Anyanyelv' },
      { name: 'Angol', level: 'Szakmai szint · napi használat' },
    ],
  },
  stacks: {
    kicker: 'Idővonal',
    heading: 'Hat stack 23 év alatt',
    intro:
      'A Flashtől és a PHP-tól a .NET-en át a TypeScriptig, az Angularig és a Java Springig. Minden sáv az első és az utolsó olyan munkakör közötti időszakot mutatja, amelyben az adott stacket használtam.',
    legendCurrent: 'jelenlegi',
    legendEarlier: 'korábbi',
    levelsTitle: 'Szenioritás munkakör szerint',
    levels: ['Junior', 'Fejlesztő', 'Senior · Lead', 'Architekt'],
    figureLabel: 'Hat technológiai stack idővonala 2003 és 2026 között',
  },
  experience: {
    kicker: 'Tapasztalat',
    heading: 'Tizenhárom év, hat munkakör',
    jobs: [
      {
        title: 'Full stack szoftverarchitekt',
        org: 'CareDx, Inc.',
        orgNote: 'transzplantációs diagnosztika, Nasdaq: CDNA',
        when: '2021. okt. – 2026. júl.',
        length: '4 év 10 hó',
        current: true,
        points: [
          '<b>Nemzetközi csapatot vezettem</b>, amely három termék kliensalkalmazásait fejlesztette: Assign, Score és Surveillance (HCT, cfDNA).',
          '<b>Az architektúráért a tervezéstől a kiadásig én feleltem</b> – egyetlen, mindhárom termék által közösen használt Angular workspace, ThreeJS-vizualizációk, Electron desktop buildek és Java Spring szolgáltatások.',
          '<b>Öt évig tartottam rendben a kódbázist</b> code review-kkal, Cypress- és Jest-tesztekkel, SonarQube-bal és Azure DevOps pipeline-okkal.',
          '<b>Mentoráltam a csapattagokat</b>, és közvetlenül dolgoztam együtt a vezetőséggel.',
        ],
      },
      {
        title: 'Full stack fejlesztő és architekt',
        org: 'ROKSH',
        orgNote: 'élelmiszer-házhozszállítás, az ALDI Magyarország partnere',
        when: '2020. máj. – 2021. okt.',
        length: '1 év 6 hó',
        points: [
          '<b>Megterveztem az architektúrát és vezettem a fejlesztést</b> a Delivery és Provider manager platformokon: .NET Core szolgáltatások Azure-on, Angular 11 PWA-k és közös libraryk.',
          '<b>Fizetési és külső szolgáltatásokat integráltam</b> (Revolut, Barion, Google API-k, Bugsnag), és én feleltem a CI/CD-ért és a telepítésért.',
        ],
      },
      {
        title: 'Senior full stack fejlesztő',
        org: 'Szabadúszó',
        orgNote: 'ERP- és webes ügyfelek',
        when: '2019. ápr. – 2020. ápr.',
        length: '1 év 1 hó',
        desc: 'A <b>10XOne ERP</b> karbantartása és továbbfejlesztése (.NET Core, WPF, SignalR, MSSQL). Előtte JAMstack oldalakat, reaktív webalkalmazásokat és Electron desktopalkalmazásokat készítettem React, Gatsby és Firebase alapokon.',
      },
      {
        title: 'Full stack webalkalmazás-fejlesztő',
        org: 'DevMads Ltd.',
        orgNote: 'StoriesOnBoard, story mapping SaaS',
        when: '2017. jan. – 2019. ápr.',
        length: '2 év 4 hó',
        desc: 'Single-page application funkciókat fejlesztettem a <b>StoriesOnBoardhoz</b>, egy iparágvezető story mapping eszközhöz: TypeScript, KnockoutJS, C# / .NET, Azure.',
      },
      {
        title: 'Senior full stack webfejlesztő',
        org: 'Outlast Web & Mobile Development',
        orgNote: 'ügynökség, remote',
        when: '2015. ápr. – 2016. dec.',
        length: '1 év 9 hó',
        desc: 'Remote munkában fejlesztettem az <b>Outlast Frameworköt</b> (PHP, JavaScript) és az <b>Iceberg</b> platformot (ASP.NET, T-SQL), Google Maps-, SendGrid- és Xero-integrációkkal.',
      },
      {
        title: 'Senior webfejlesztő',
        org: 'AsystANT Ltd.',
        orgNote: 'GPS-alapú flottakövetés',
        when: '2013. jún. – 2015. jan.',
        length: '1 év 8 hó',
        desc: 'Web- és adatbázis-fejlesztés egy <b>GPS-alapú flottakövető</b> termékhez, webes és desktop platformra: Symfony, ExtJS, Oracle PL/SQL, REST API-k.',
      },
    ],
  },
  work: {
    kicker: 'Válogatott munkák',
    heading: 'Termékek, amelyeken dolgoztam',
    intro: 'Nyolc termék 2008 és 2026 között: mindegyiknél az, hogy mi a termék, és milyen technológiákra épül.',
    newTab: '(a weboldal új lapon nyílik meg)',
    cards: [
      {
        name: 'Assign · Score · Surveillance',
        company: 'CareDx',
        role: 'Architekt · csapatvezető',
        sentence:
          'Három transzplantációs diagnosztikai termék kliensalkalmazásai egyetlen közös Angular workspace-ben, ThreeJS-vizualizációkkal és Electron desktop buildekkel, Java Spring szolgáltatásokra építve.',
      },
      {
        name: 'Delivery & Provider manager platformok',
        company: 'ROKSH',
        role: 'Architekt · vezető fejlesztő',
        sentence:
          'Platformok egy élelmiszer-házhozszállító szolgáltatásnak, az ALDI Magyarország partnerének: .NET Core szolgáltatások Azure-on, Angular PWA-k és fizetési integrációk.',
      },
      {
        name: '10XOne ERP',
        company: 'Szabadúszó',
        role: 'Senior full stack .NET fejlesztő',
        sentence: 'A 10XOne ERP meglévő funkcióinak karbantartása, valamint új funkciók kutatása és megvalósítása.',
      },
      {
        name: 'StoriesOnBoard',
        company: 'DevMads',
        role: 'Full stack fejlesztő',
        sentence: 'Single-page alkalmazásfejlesztés egy iparágvezető story mapping eszközhöz.',
      },
      {
        name: 'Iceberg & Outlast Framework',
        company: 'Outlast',
        role: 'Senior full stack fejlesztő · remote',
        sentence:
          'Egy ügynökség saját PHP- és JavaScript-keretrendszere és egy ASP.NET platform, rengeteg API-integrációval: Google Maps, SendGrid, Postmark, Xero, ACHWorks.',
      },
      {
        name: 'GPS-alapú flottakövetés',
        company: 'AsystANT',
        role: 'Senior webfejlesztő',
        sentence: 'GPS-alapú járműflotta-követő alkalmazás webre és desktopra, Oracle, ExtJS és Symfony alapokon.',
      },
      {
        name: 'Mindentudás Egyeteme portál',
        company: 'Mindentudás Egyeteme',
        role: 'Joomla CMS fejlesztő',
        sentence: 'A közismert magyar tudományos tévéműsor webportálja, Joomlára építve.',
      },
      {
        name: 'Honlapépítő alkalmazás',
        company: 'Megaweb',
        role: 'PHP fejlesztő',
        sentence: 'Egyedi, kereskedelmi online honlapkészítő a cég saját PHP-keretrendszerén („mayaFish”).',
      },
    ],
  },
  skills: {
    kicker: 'Szakmai készségek',
    heading: 'Az eszköztár',
    groups: [
      { title: 'Front end', items: '<b>Angular · TypeScript · RxJS</b> · React · Electron' },
      { title: 'Back end', items: '<b>Java Spring · .NET Core / C#</b> · Node.js · PHP' },
      { title: 'Adat', items: 'MSSQL · MySQL · Oracle PL/SQL · SQLite' },
      { title: 'Cloud és delivery', items: '<b>Azure · Azure DevOps</b> · Docker · CI/CD · Netlify' },
      { title: 'Minőség és workflow', items: 'Cypress · Jest · SonarQube · Git / GitHub · npm · Jira' },
    ],
    marqueeLabel: 'Technológiák',
  },
  earlier: {
    kicker: 'Korábban · 2003–2013',
    heading: 'Ahol minden kezdődött',
    rows: [
      { years: '2012–13', name: 'GBaRT', what: 'vezető webfejlesztő' },
      { years: '2011–12', name: 'Szabadúszó', what: 'Joomla, Yii, Symfony 2' },
      { years: '2010–11', name: 'Mindentudás Egyeteme', what: 'a tévéműsor portálja' },
      { years: '2009–10', name: 'Colabs', what: 'szabadúszó, Flash / Flex, PHP' },
      { years: '2008–09', name: 'Megaweb', what: 'PHP, honlapépítő alkalmazás' },
      { years: '2008', name: 'Ogilvy / Redworks', what: 'kampány-webalkalmazások' },
      { years: '2003–07', name: 'Junior webfejlesztő', what: 'amstudio, EnterSion, Webvilág, Egedesign' },
    ],
  },
  contact: {
    kicker: 'Kapcsolat',
    heading: 'Beszéljünk!',
    line: 'Közvetlenül is elérhető vagyok.',
    phoneNote: 'Signal',
    location: 'Marcali, Magyarország',
    timezoneNote: 'CET',
    cv: 'Önéletrajz letöltése',
    cvNote: 'PDF · egy oldal · angol nyelvű',
    labels: { phone: 'Telefon', email: 'E-mail', linkedin: 'LinkedIn', location: 'Helyszín' },
  },
  footer: { builtWith: 'Készült: Astro · three.js · Danet' },
  notFound: {
    title: 'Az oldal nem található',
    text: 'Ez az oldal nem létezik. Az önéletrajz egyetlen oldal, és itt található:',
    back: 'Vissza az önéletrajzhoz',
  },
};

export default hu;
