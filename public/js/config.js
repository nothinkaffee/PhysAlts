/**
 * PhysAlts — Subject Adapter Configuration (Atlas Engine v2)
 * Swap this config + public/data/* files to launch another discipline (e.g. AI Atlas next).
 */

export const USE_DEV_PROXY = Boolean(window.__PHYSALTS_DEV_PROXY__) ||
  (location.protocol === "http:" && (location.hostname === "localhost" || location.hostname === "127.0.0.1"));

export function proxyUrl(url) {
  if (!url) return "";
  return (USE_DEV_PROXY && /^https:\/\//.test(url))
    ? `./_proxy?url=${encodeURIComponent(url)}`
    : url;
}

export const SUBJECT_CONFIG = {
  id: "physalts",
  appName: "World of Physics",
  tagline: "World of Physics",
  storagePrefix: "physalts_v2_",
  dataFiles: {
    flagships: "./data/curated_flagships.json",
    scrapedHubs: "./data/physics_hubs.json",
    privateStartups: "./data/private_startups.json",
    historyTimeline: "./data/history_timeline.json",
    spaceFrontier: "./data/space_frontier.json",
    domainsCatalog: "./data/domains_catalog.json",
    verificationReport: "./data/verification_report.json",
    provenanceLedger: "./data/provenance_ledger.json"
  }
};

export const PHYSICS_BRANCHES = [
  { id: "all",       label: "All Branches of Physics",       desc: "Complete global map across every subfield" },
  { id: "particle",  label: "Particle & High-Energy",        desc: "Colliders, neutrinos, dark matter, QCD" },
  { id: "quantum",   label: "Quantum & Photonics",           desc: "Qubits, attosecond lasers, quantum optics, EUV" },
  { id: "astro",     label: "Astrophysics & Cosmology",      desc: "Optical/radio telescopes, black holes, CMB" },
  { id: "gravity",   label: "Gravitational Waves & Theory",  desc: "LIGO, general relativity, quantum gravity" },
  { id: "fusion",    label: "Fusion & Plasma Physics",       desc: "Tokamaks, stellarators, HTS magnets, burning plasma" },
  { id: "condensed", label: "Condensed Matter & Materials",  desc: "Synchrotrons, neutrons, 2D materials, superconductors" },
  { id: "applied",   label: "Applied, Space & Biophysics",   desc: "Space instrumentation, biophysics, fluid dynamics, metrology" },
  { id: "history",   label: "History & Nobel Origins",       desc: "From Anaximander & 1200 CE Optics to Modern Physics" }
];

export const ENTITY_FILTERS = [
  { id: "all",       label: "All" },
  { id: "lab",       label: "Labs" },
  { id: "uni",       label: "Universities" },
  { id: "company",   label: "Private & Startups" },
  { id: "history",   label: "History" }
];

export const STAGE_META = {
  all:        { label: "All Stages",           short: "All" },
  highschool: { label: "High School",          short: "High School" },
  undergrad:  { label: "Undergraduate",        short: "Undergrad" },
  masters:    { label: "Graduate / Master's",  short: "Master's" },
  phd:        { label: "Postgrad / PhD",       short: "PhD" },
  postdoc:    { label: "Postdoc",              short: "Postdoc" },
  assoc_prof: { label: "Associate Professor",  short: "Assoc. Prof" },
  prof:       { label: "Professor / PI",       short: "Professor" }
};

export const STAGE_PORTALS = {
  all: [
    { name: "DAAD (Germany)", url: "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/" },
    { name: "EURAXESS Jobs", url: "https://euraxess.ec.europa.eu/jobs" },
    { name: "INSPIRE-HEP Jobs", url: "https://inspirehep.net/jobs" }
  ],
  highschool: [
    { name: "CERN Beamline for Schools", url: "https://beamlineforschools.cern/" },
    { name: "Perimeter ISSYP", url: "https://perimeterinstitute.ca/issyp" },
    { name: "IPhO Physics Olympiad", url: "https://www.ipho-new.org/" }
  ],
  undergrad: [
    { name: "CERN Summer Student", url: "https://careers.cern/summer" },
    { name: "NSF Physics REU", url: "https://www.nsf.gov/crssprgm/reu/" },
    { name: "DESY Summer Program", url: "https://summerstudents.desy.de/" },
    { name: "DAAD RISE Germany", url: "https://www.daad.de/rise/en/" }
  ],
  masters: [
    { name: "DAAD Intl. Master's", url: "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/" },
    { name: "Erasmus Mundus", url: "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters" },
    { name: "MEXT Japan", url: "https://www.studyinjapan.go.jp/en/planning/scholarships/mext-scholarships/" },
    { name: "Perimeter PSI MSc", url: "https://perimeterinstitute.ca/psi-masters-program" }
  ],
  phd: [
    { name: "Max Planck IMPRS", url: "https://www.mpg.de/en/imprs" },
    { name: "Marie Curie Doctoral", url: "https://marie-sklodowska-curie-actions.ec.europa.eu/" },
    { name: "INSPIRE-HEP PhDs", url: "https://inspirehep.net/jobs?rank=PHD" },
    { name: "ETH Zurich PhD", url: "https://www.phys.ethz.ch/studies/doctorate.html" }
  ],
  postdoc: [
    { name: "MSCA Postdoc Fellowships", url: "https://marie-sklodowska-curie-actions.ec.europa.eu/actions/postdoctoral-fellowships" },
    { name: "CERN Research Fellows", url: "https://careers.cern/" },
    { name: "NASA Hubble (NHFP)", url: "https://www.stsci.edu/stsci-research/fellowships/nasa-hubble-fellowship-program" },
    { name: "INSPIRE Postdocs", url: "https://inspirehep.net/jobs?rank=POSTDOC" }
  ],
  assoc_prof: [
    { name: "ERC Consolidator Grant", url: "https://erc.europa.eu/apply-grant/consolidator-grant" },
    { name: "AcademicJobsOnline", url: "https://academicjobsonline.org/" },
    { name: "EURAXESS Faculty", url: "https://euraxess.ec.europa.eu/jobs" }
  ],
  prof: [
    { name: "ERC Advanced Grant", url: "https://erc.europa.eu/apply-grant/advanced-grant" },
    { name: "ESO / CERN Beamtime", url: "https://www.eso.org/sci/observing/phase1.html" },
    { name: "APS Physics Jobs", url: "https://careers.aps.org/" }
  ]
};

export const TIME_PRESETS = [
  { year: -1800, label: "1800 BCE", title: "Babylonian Astronomy" },
  { year: -580,  label: "580 BCE",  title: "Anaximander" },
  { year: -400,  label: "400 BCE",  title: "Mozi Optics" },
  { year: 1021,  label: "1021 CE",  title: "Ibn al-Haytham" },
  { year: 1259,  label: "1259 CE",  title: "Maragheh" },
  { year: 1687,  label: "1687",     title: "Principia" },
  { year: 1905,  label: "1905",     title: "Einstein" },
  { year: 1927,  label: "1927",     title: "Solvay" },
  { year: 2012,  label: "2012",     title: "Higgs" },
  { year: 2026,  label: "Now",      title: "Present" },
  { year: 2035,  label: "2035+",    title: "Upcoming" }
];

export const COLLABORATION_ARCS = [
  ["cern", "fermilab"], ["cern", "desy"], ["cern", "eth-zurich"], ["cern", "mit"],
  ["cern", "paris-saclay"], ["cern", "kek"], ["cern", "triumf"], ["cern", "gran-sasso"],
  ["ligo-hanford", "mit"], ["ligo-hanford", "caltech"], ["ligo-hanford", "aei-potsdam"],
  ["iter", "cfs-boston"], ["iter", "mpq-garching"], ["iter", "paris-saclay"],
  ["icecube", "desy"], ["icecube", "super-k"], ["alma", "eso-paranal"], ["eso-paranal", "meerkat"],
  ["perimeter", "ias-princeton"], ["asml", "qutech-delft"], ["tokyo", "riken"], ["cern", "sesame-jordan"]
];

export function formatYear(y) {
  if (y == null || Number.isNaN(Number(y))) return "Present";
  const n = Math.round(Number(y));
  if (n < 0) return `${Math.abs(n)} BCE`;
  if (n < 1500) return `${n} CE`;
  return String(n);
}

export function classifyPhysicsBranch(text) {
  const t = (text || "").toLowerCase();
  if (/cern|fermi|collider|hadron|neutrino|particle|nuclear|cyclotron|accelerator|desy|kek|triumf|high energy/.test(t)) return "particle";
  if (/quantum|photon|laser|optic|euv|attosecond|qubit|nanophoton/.test(t)) return "quantum";
  if (/astro|observator|telescope|cosmo|space|radio|astron|planetar/.test(t)) return "astro";
  if (/fusion|plasma|tokamak|stellarator|iter|magnet/.test(t)) return "fusion";
  if (/gravit|relativ|ligo|virgo|kagra|theoretical|perimeter|ias|string/.test(t)) return "gravity";
  if (/synchrotron|neutron|spallation|condensed|material|superconduct|solid state|graphene|magnetism/.test(t)) return "condensed";
  if (/biophys|geophys|metrolog|aerospace|propulsion|fluid|acoustic/.test(t)) return "applied";
  return "condensed";
}

export function buildDefaultStages(overrides = {}) {
  return {
    highschool: overrides.highschool || "Public science outreach, open data portals, and regional physics olympiad / summer school prep.",
    undergrad:  overrides.undergrad  || "Summer research internships, undergraduate thesis visits, and open datasets.",
    masters:    overrides.masters    || "English-taught MSc coursework and supervised research thesis tracks.",
    phd:        overrides.phd        || "Funded 3–5 year doctoral fellowships with international research groups.",
    postdoc:    overrides.postdoc    || "2–3 year independent postdoctoral fellowships and international grant mobility.",
    assoc_prof: overrides.assoc_prof || "Tenure-track / Associate Professor appointments, group-leader grants (ERC/NSF), and collaboration PI roles.",
    prof:       overrides.prof       || "Full Professor chairs, mega-experiment leadership, visiting sabbaticals, and consortia direction."
  };
}
