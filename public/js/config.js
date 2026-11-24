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
  appName: "PhysALT",
  tagline: "PhysALT",
  storagePrefix: "physalts_v2_",
  dataFiles: {
    flagships: "./data/curated_flagships.json",
    scrapedHubs: "./data/physics_hubs.json",
    privateStartups: "./data/private_startups.json",
    historyTimeline: "./data/history_timeline.json",
    spaceFrontier: "./data/space_frontier.json",
    domainsCatalog: "./data/domains_catalog.json",
    verificationReport: "./data/verification_report.json",
    provenanceLedger: "./data/provenance_ledger.json",
    stemAiCs: "./data/stem/ai_cs_hubs.json",
    stemMath: "./data/stem/math_hubs.json",
    stemBioMed: "./data/stem/bio_med_hubs.json",
    stemChemEarthEng: "./data/stem/chem_earth_eng_hubs.json",
    stemEngineering: "./data/stem/engineering_hubs.json",
    stemTimeline: "./data/stem/stem_timeline.json",
    stemDomains: "./data/stem/stem_domains.json",
    rabbitTrails: "./data/stem/rabbit_trails.json"
  }
};

export const STEM_DISCIPLINES = [
  { id: "all",            label: "All STEM",        short: "All STEM",    desc: "Physics, Engineering, AI & CS, Math, Biology, Chemistry & Earth" },
  { id: "physics",        label: "Physics & Space", short: "Physics",     desc: "Colliders, quantum, cosmology, fusion & condensed matter" },
  { id: "engineering",    label: "Engineering",     short: "Engineering", desc: "Aerospace, semiconductors, robotics, clean energy, bio-eng & materials" },
  { id: "ai_cs",          label: "AI & Computing",  short: "AI & CS",     desc: "Frontier AI, HPC systems, theory/crypto, graphics & quantum computing" },
  { id: "math",           label: "Mathematics",     short: "Math",        desc: "Algebra, number theory, analysis, PDEs, probability, logic & proof" },
  { id: "bio_med",        label: "Biology & Med",   short: "Biology",     desc: "Genomics, CRISPR, neuroscience, structural biology & ecology" },
  { id: "chem_materials", label: "Chemistry",       short: "Chemistry",   desc: "Synthesis, catalysis, nanomaterials, batteries & computational chemistry" },
  { id: "earth_climate",  label: "Earth & Climate", short: "Climate",     desc: "Atmosphere, climate modeling, oceanography, geophysics & planetary" }
];

export const PHYSICS_BRANCHES = [
  { id: "all",               label: "All Subfields",                 disc: "all",            desc: "Complete global map across every STEM discipline" },
  // Physics (7)
  { id: "particle",          label: "Particle & High-Energy",        disc: "physics",        desc: "Colliders, neutrinos, dark matter, QCD" },
  { id: "quantum",           label: "Quantum & Photonics",           disc: "physics",        desc: "Qubits, attosecond lasers, quantum optics, EUV" },
  { id: "astro",             label: "Astrophysics & Cosmology",      disc: "physics",        desc: "Optical/radio telescopes, black holes, CMB" },
  { id: "gravity",           label: "Gravitational Waves & Theory",  disc: "physics",        desc: "LIGO, general relativity, quantum gravity" },
  { id: "fusion",            label: "Fusion & Plasma Physics",       disc: "physics",        desc: "Tokamaks, stellarators, HTS magnets, burning plasma" },
  { id: "condensed",         label: "Condensed Matter & Materials",  disc: "physics",        desc: "Synchrotrons, neutrons, 2D materials, superconductors" },
  { id: "applied",           label: "Applied, Space & Biophysics",   disc: "physics",        desc: "Space instrumentation, biophysics, fluid dynamics, metrology" },
  // Engineering & Technology (6)
  { id: "aerospace",         label: "Aerospace & Propulsion",        disc: "engineering",    desc: "Rockets, orbital propulsion, aerodynamics & flight test" },
  { id: "semiconductors",    label: "Semiconductors & Photonics",    disc: "engineering",    desc: "EUV lithography, sub-2 nm fabs, silicon photonics & AI chips" },
  { id: "robotics",          label: "Robotics & Autonomy",           disc: "engineering",    desc: "Embodied robotics, humanoids, control systems & autonomous vehicles" },
  { id: "energy_civil",      label: "Energy, Nuclear & Civil",       disc: "engineering",    desc: "Grid storage, wind/solar, advanced nuclear & hydraulics" },
  { id: "biomedical_eng",    label: "Biomedical & Neural Eng",       disc: "engineering",    desc: "Neural interfaces, bio-fabrication, surgical robotics & organoids" },
  { id: "materials_mfg",     label: "Materials & Manufacturing",     disc: "engineering",    desc: "Metallurgy, additive manufacturing, composites & metrology" },
  // AI & Computer Science (5)
  { id: "ai_frontier",       label: "Frontier AI & Alignment",       disc: "ai_cs",          desc: "Foundation models, RL, reasoning & mechanistic interpretability" },
  { id: "systems_arch",      label: "Systems, HPC & Architecture",   disc: "ai_cs",          desc: "Exascale supercomputers, compilers, chips & distributed systems" },
  { id: "theory_crypto",     label: "Algorithms, Crypto & Formal",   disc: "ai_cs",          desc: "Complexity theory, cryptography & formal verification" },
  { id: "graphics_hci",      label: "Vision, Graphics & HCI",        disc: "ai_cs",          desc: "Computer vision, 3D graphics, simulation & human-computer interaction" },
  { id: "quantum_cs",        label: "Quantum Computing",             disc: "ai_cs",          desc: "Fault-tolerant qubits, neutral atoms, trapped ions & quantum algorithms" },
  // Mathematics (4)
  { id: "pure_math",         label: "Algebra & Number Theory",       disc: "math",           desc: "Algebraic geometry, Langlands program, number theory & arithmetic" },
  { id: "analysis_pde",      label: "Analysis, Geometry & PDEs",     disc: "math",           desc: "Differential geometry, fluid PDEs, dynamical systems & harmonic analysis" },
  { id: "applied_stat",      label: "Applied Math & Statistics",     disc: "math",           desc: "Probability, statistical inference, optimization & complex systems" },
  { id: "logic_comb",        label: "Logic, Combinatorics & Proof",  disc: "math",           desc: "Graph theory, topology, foundations & Lean formal proof assistants" },
  // Biology & Medicine (4)
  { id: "genomics_synbio",   label: "Genomics, CRISPR & SynBio",     disc: "bio_med",        desc: "Gene editing, sequencing, cell atlases & synthetic biology" },
  { id: "neuroscience",      label: "Neuroscience & BCIs",           disc: "bio_med",        desc: "Connectomics, systems neuroscience & neural recording probes" },
  { id: "structural_pharma", label: "Structural Bio & Pharma",       disc: "bio_med",        desc: "Cryo-EM, AlphaFold protein design, immunology & mRNA medicine" },
  { id: "ecology_evo",       label: "Evolution, Marine & Microbiome",disc: "bio_med",        desc: "Paleogenomics, marine biology, biodiversity & evolutionary ecology" },
  // Chemistry & Materials (3)
  { id: "catalysis_synth",   label: "Synthesis & Catalysis",         disc: "chem_materials", desc: "Organic catalysis, electrochemistry, asymmetric synthesis & green chem" },
  { id: "nanomaterials",     label: "Nanomaterials & Batteries",     disc: "chem_materials", desc: "Graphene, 2D heterostructures, solid-state batteries & polymers" },
  { id: "comp_chem",         label: "Theoretical & Comp Chem",       disc: "chem_materials", desc: "Quantum chemistry, molecular dynamics & ultrafast spectroscopy" },
  // Earth, Climate & Planetary (3)
  { id: "climate_atmo",      label: "Climate, Atmosphere & Polar",   disc: "earth_climate",  desc: "Earth-system modeling, weather prediction, ice cores & glaciology" },
  { id: "ocean_geo",         label: "Oceanography & Geophysics",     disc: "earth_climate",  desc: "Deep-sea science, plate tectonics, seismology & volcanology" },
  { id: "planetary_env",     label: "Planetary & Earth Systems",     disc: "earth_climate",  desc: "Planetary geology, satellite Earth observation & resilience science" },
  // Cross-cutting
  { id: "history",           label: "History & Origins",             disc: "all",            desc: "From 1800 BCE & Euclid to Modern Frontier Science" }
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
  ["cern", "fermilab"], ["cern", "desy"], ["cern", "eth"], ["cern", "mit"],
  ["cern", "parissaclay"], ["cern", "kek"], ["cern", "triumf"], ["cern", "gransasso"],
  ["ligo", "mit"], ["ligo", "caltech"], ["ligo", "aei"],
  ["iter", "cfs"], ["iter", "mpq"], ["iter", "parissaclay"],
  ["icecube", "desy"], ["icecube", "superk"], ["alma", "paranal"], ["paranal", "meerkat"],
  ["perimeter", "princeton"], ["asml", "qutech"], ["utokyo", "riken"], ["cern", "sesame"],
  ["asml", "imec"], ["imec", "tsmc_rd"], ["tsmc_rd", "nvidia_research"],
  ["deepmind", "embl_ebi"], ["deepmind", "ecmwf"], ["mrc_lmb", "embl_ebi"],
  ["imec", "hhmi_janelia"], ["broad_institute", "sanger_institute"],
  ["ias_princeton", "ihes"], ["ncar", "ecmwf"]
];

export function formatYear(y) {
  if (y == null || Number.isNaN(Number(y))) return "Present";
  const n = Math.round(Number(y));
  if (n < 0) return `${Math.abs(n)} BCE`;
  if (n < 1500) return `${n} CE`;
  return String(n);
}

export const BRANCH_SHORT_LABELS = {
  all: "All Subfields",
  // Physics
  particle: "Particle & HEP",
  quantum: "Quantum & Optics",
  astro: "Astrophysics",
  gravity: "Gravity & Theory",
  fusion: "Fusion & Plasma",
  condensed: "Condensed Matter",
  applied: "Applied & Space",
  // Engineering
  aerospace: "Aerospace",
  semiconductors: "Semiconductors",
  robotics: "Robotics",
  energy_civil: "Energy & Civil",
  biomedical_eng: "Biomedical Eng",
  materials_mfg: "Materials & Mfg",
  // AI & CS
  ai_frontier: "Frontier AI",
  systems_arch: "Systems & HPC",
  theory_crypto: "Theory & Crypto",
  graphics_hci: "Vision & HCI",
  quantum_cs: "Quantum CS",
  // Math
  pure_math: "Algebra & Number",
  analysis_pde: "Analysis & PDEs",
  applied_stat: "Applied & Stats",
  logic_comb: "Logic & Proof",
  // Biology & Med
  genomics_synbio: "Genomics & SynBio",
  neuroscience: "Neuroscience",
  structural_pharma: "Structural Bio",
  ecology_evo: "Ecology & Marine",
  // Chemistry
  catalysis_synth: "Catalysis & Synth",
  nanomaterials: "Nanomaterials",
  comp_chem: "Comp Chemistry",
  // Earth & Climate
  climate_atmo: "Climate & Polar",
  ocean_geo: "Ocean & Geo",
  planetary_env: "Planetary & Earth",
  // Legacy aliases & cross-cutting
  ai_cs: "AI & Computing",
  math: "Mathematics",
  bio_med: "Biology & Bio",
  chem_materials: "Chemistry",
  earth_climate: "Earth & Climate",
  engineering: "Engineering",
  history: "History",
  multi: "Multi-Branch"
};

export const BRANCH_TO_DISCIPLINE = Object.fromEntries(
  PHYSICS_BRANCHES.filter(b => b.disc && b.disc !== "all").map(b => [b.id, b.disc])
);

export function classifyPhysicsBranch(text) {
  const t = (text || "").toLowerCase();
  if (/\b(cern|fermi|collider|hadron|neutrino|particle|nuclear|cyclotron|accelerator|desy|kek|triumf|high energy|gran sasso|snolab)\b/.test(t)) return "particle";
  if (/\b(fusion|plasma|tokamak|stellarator|iter|culham|ukaea|pppl)\b/.test(t)) return "fusion";
  if (/\b(gravit|relativ|ligo|virgo|kagra|theoretical physics|perimeter|ias|string)\b/.test(t)) return "gravity";
  if (/\b(astro|observator|telescope|cosmo|astron|planetar|extraterrestrial)\b/.test(t)) return "astro";
  if (/\b(quantum|photon|laser|optic|euv|attosecond|qubit|nanophoton|spectroscop)\b/.test(t)) return "quantum";
  if (/\b(synchrotron|neutron|spallation|condensed|material|superconduct|solid state|graphene|magnetism|cryo|semiconduct)\b/.test(t)) return "condensed";
  if (/\b(biophys|geophys|metrolog|aerospace|space|propulsion|fluid|acoustic|climate|seism|medical physics|hadrontherapy)\b/.test(t)) return "applied";
  return "multi";
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
