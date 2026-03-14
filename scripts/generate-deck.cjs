const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaShieldAlt, FaBolt, FaChartLine, FaDollarSign, FaClock, FaUsers,
  FaDatabase, FaArrowRight, FaCheck, FaStar, FaUtensils,
  FaMapMarkerAlt, FaMicrophone, FaLock, FaExchangeAlt, FaCog,
  FaClipboardCheck, FaTruck, FaBuilding, FaChartBar, FaLayerGroup,
  FaBalanceScale, FaBan, FaEye, FaServer, FaCubes, FaCamera,
  FaCalendarCheck, FaGavel, FaWifi, FaRegClock, FaExclamationTriangle,
  FaRobot, FaBrain, FaHandshake, FaCrosshairs, FaFileInvoiceDollar,
  FaConciergeBell
} = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

async function kMarkToBase64(color, widthPx = 180) {
  const h = Math.round(widthPx * 58 / 52);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 58" width="${widthPx}" height="${h}">
    <rect x="0" y="0" width="12" height="58" rx="2" fill="${color}"/>
    <polygon points="12,18 52,0 52,12 12,30" fill="${color}"/>
    <polygon points="12,34 52,46 52,58 12,40" fill="${color}"/>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

async function main() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "The Binyan Group";
  pres.title = "KevaOS — The AI-Enforced Control Plane for Hospitality";

  const SLATE = "1C1917", SLATE2 = "292524", SLATE3 = "44403C";  // Espresso darks
  const BRASS = "D4622B", SAGE = "8B7E6F";                      // Warm brass + taupe
  const OLIVE = "5C6B4F";                                        // Secondary accent
  const FOG = "FAF8F5", WHITE = "FFFEFB", CARD = "FFFEFB", CARD_ALT = "F5F1EB"; // Ivory/cream/linen
  const BORDER = "E8E2DA", MID = "8B7E6F", DIM = "B5ADA1", ERR = "DC2626";     // Stone borders, taupe text
  const BRASS_TINT = "FDF5EF", BRASS_LIGHT = "FCEADB";          // Warm orange tints
  const GREEN = "059669";
  const AMBER_BG = "F5F1EB", AMBER_TEXT = "7C2D12";             // BETA: linen bg, umber text
  const UMBER = "7C2D12";                                        // Deep warm brown

  const mkShadow = () => ({ type: "outer", blur: 4, offset: 1, angle: 135, color: "1C1917", opacity: 0.06 });
  const FONT = "Space Grotesk", MONO = "JetBrains Mono";
  const ICON_ACC = "#D4622B", ICON_ERR = "#DC2626";

  // Icons
  const iChart = await iconToBase64Png(FaChartLine, ICON_ACC);
  const iDollar = await iconToBase64Png(FaDollarSign, ICON_ACC);
  const iClock = await iconToBase64Png(FaClock, ICON_ACC);
  const iUsers = await iconToBase64Png(FaUsers, ICON_ACC);
  const iClip = await iconToBase64Png(FaClipboardCheck, ICON_ACC);
  const iTruck = await iconToBase64Png(FaTruck, ICON_ACC);
  const iBar = await iconToBase64Png(FaChartBar, ICON_ACC);
  const iBan = await iconToBase64Png(FaBan, ICON_ERR);
  const iEye = await iconToBase64Png(FaEye, ICON_ACC);
  const iCog = await iconToBase64Png(FaCog, ICON_ACC);
  const iCheck = await iconToBase64Png(FaCheck, ICON_ACC);
  const iStar = await iconToBase64Png(FaStar, ICON_ACC);
  const iCubes = await iconToBase64Png(FaCubes, ICON_ACC);
  const iArrow = await iconToBase64Png(FaArrowRight, ICON_ACC);
  const iCamera = await iconToBase64Png(FaCamera, ICON_ACC);
  const iGavel = await iconToBase64Png(FaGavel, ICON_ACC);
  const iRobot = await iconToBase64Png(FaRobot, ICON_ACC);
  const iBrain = await iconToBase64Png(FaBrain, ICON_ACC);
  const iInvoice = await iconToBase64Png(FaFileInvoiceDollar, ICON_ACC);
  const iBell = await iconToBase64Png(FaConciergeBell, ICON_ACC);
  const iCheckOlive = await iconToBase64Png(FaCheck, "#5C6B4F"); // Olive checks for policy/control sections

  // K monogram logos
  const kMarkBrass = await kMarkToBase64("#D4622B", 256);
  const kMarkDark  = await kMarkToBase64("#1C1917", 256);
  const kMarkSmall = await kMarkToBase64("#D4622B", 64);

  // Helpers
  // Logo lockup: K mark tightly coupled to "eva" bold + "OS" in brass (K mark IS the K)
  function logoLockup(slide, x, y, scale = 1.0) {
    const mw = 0.18 * scale, mh = 0.26 * scale; // Smaller mark, matches cap-height
    const fs = Math.round(12 * scale);
    const gap = 0.01 * scale; // tight — K mark flows into "eva"
    slide.addImage({ data: kMarkSmall, x: x, y: y + 0.01 * scale, w: mw, h: mh });
    slide.addText([
      { text: "eva", options: { fontSize: fs, fontFace: FONT, color: SLATE, bold: true, charSpacing: 1 } },
      { text: "OS", options: { fontSize: fs, fontFace: FONT, color: BRASS, bold: false, charSpacing: 1 } },
    ], { x: x + mw + gap, y: y, w: 2 * scale, h: mh + 0.02 * scale, valign: "middle", margin: 0 });
  }
  function hdr(slide) {
    slide.background = { color: FOG };
    slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: BRASS } });
    slide.addText([
      { text: "Keva", options: { fontSize: 10, fontFace: FONT, color: SLATE, bold: true, charSpacing: 2 } },
      { text: "OS", options: { fontSize: 10, fontFace: FONT, color: BRASS, bold: false, charSpacing: 2 } },
    ], { x: 0.5, y: 0.15, w: 2, h: 0.3, valign: "middle", margin: 0 });
  }
  function snum(slide, n) {
    slide.addText(n, { x: 9.1, y: 5.15, w: 0.6, h: 0.3, fontSize: 9, fontFace: MONO, color: DIM, align: "right" });
  }
  function title(slide, txt) {
    slide.addText(txt, { x: 0.7, y: 0.55, w: 8.6, h: 0.65, fontSize: 32, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
  }
  function subtitle(slide, txt) {
    slide.addText(txt, { x: 0.7, y: 1.15, w: 8.6, h: 0.35, fontSize: 14, fontFace: FONT, color: SAGE, margin: 0 });
  }
  function footerNote(slide, txt) {
    slide.addText(txt, { x: 0.7, y: 5.05, w: 8.6, h: 0.35, fontSize: 11, fontFace: FONT, color: SAGE, italic: true, margin: 0 });
  }

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 1 — TITLE
  // ═══════════════════════════════════════════════════════════════
  let s1 = pres.addSlide();
  s1.background = { color: WHITE };
  s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: BRASS } });
  s1.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 1.0, w: 0.06, h: 2.2, fill: { color: BRASS } });
  // Logo: K mark stacked above wordmark
  s1.addImage({ data: kMarkBrass, x: 0.7, y: 0.2, w: 0.24, h: 0.34 });
  s1.addText([
    { text: "Keva", options: { fontSize: 12, fontFace: FONT, color: SLATE, bold: true, charSpacing: 2 } },
    { text: "OS", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: false, charSpacing: 2 } },
  ], { x: 0.7, y: 0.56, w: 2, h: 0.25, margin: 0 });
  s1.addText("The AI-Enforced Control", { x: 1.1, y: 1.1, w: 8.5, h: 0.8, fontSize: 44, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
  s1.addText("Plane for Hospitality", { x: 1.1, y: 1.8, w: 8.5, h: 0.8, fontSize: 44, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s1.addText([
    { text: "Keva ", options: { fontSize: 18, fontFace: FONT, color: BRASS, italic: true } },
    { text: "  —  permanence, fixity, establishment.", options: { fontSize: 18, fontFace: FONT, color: SAGE, italic: true } },
  ], { x: 1.1, y: 2.8, w: 7, h: 0.4, margin: 0 });
  s1.addText("The fixed framework that runs every night, every shift, every venue. Not recommendations — enforcement.", {
    x: 1.1, y: 3.5, w: 6.5, h: 0.8, fontSize: 14, fontFace: FONT, color: MID, lineSpacingMultiple: 1.5, margin: 0
  });
  // Footer with logo lockup
  s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: CARD_ALT } });
  s1.addText([
    { text: "Keva", options: { fontSize: 8, fontFace: FONT, color: SLATE, bold: true } },
    { text: "OS", options: { fontSize: 8, fontFace: FONT, color: BRASS } },
    { text: "  |  THE BINYAN GROUP  |  CONFIDENTIAL", options: { fontSize: 8, fontFace: FONT, color: SAGE } },
  ], { x: 0.5, y: 5.25, w: 5, h: 0.3, valign: "middle", margin: 0 });
  s1.addText("2026", { x: 7.5, y: 5.25, w: 2, h: 0.3, fontSize: 9, fontFace: FONT, color: SAGE, align: "right", margin: 0 });

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 2 — THE PROBLEM
  // ═══════════════════════════════════════════════════════════════
  let s2 = pres.addSlide();
  hdr(s2);
  title(s2, "Every Restaurant Runs on Trust");
  subtitle(s2, "Trust breaks. Every night.");
  const probs = [
    { title: "Advisory, Not Enforced", desc: "Every ops platform gives recommendations. Managers ignore them. Nory says \"you're overstaffed.\" Manager schedules the same way.", icon: iChart },
    { title: "Self-Reported Data", desc: "Comp logs, cleaning checklists, inventory counts — all self-reported by the people with incentive to lie.", icon: iClip },
    { title: "No Ground Truth", desc: "No sensor data. No verification layer. No way to confirm what actually happened on the floor vs. what the manager says.", icon: iEye },
    { title: "Fragmented Stack", desc: "POS, scheduling, inventory, payroll, reservations — six vendors, no enforcement layer connecting them.", icon: iCubes },
  ];
  probs.forEach((p, i) => {
    const row = Math.floor(i / 2), col = i % 2;
    const px = 0.5 + col * 4.6, py = 1.7 + row * 1.7;
    s2.addShape(pres.shapes.RECTANGLE, { x: px, y: py, w: 4.3, h: 1.45, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
    s2.addImage({ data: p.icon, x: px + 0.2, y: py + 0.15, w: 0.28, h: 0.28 });
    s2.addText(p.title, { x: px + 0.6, y: py + 0.12, w: 3.5, h: 0.3, fontSize: 13, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
    s2.addText(p.desc, { x: px + 0.2, y: py + 0.55, w: 3.9, h: 0.7, fontSize: 11, fontFace: FONT, color: MID, lineSpacingMultiple: 1.3, margin: 0 });
  });
  footerNote(s2, "Result: $1M+ in annual operational waste per high-volume venue. Controllable. Currently uncontrolled.");
  snum(s2, "02");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 3 — ENFORCEMENT ENGINE
  // ═══════════════════════════════════════════════════════════════
  let s3 = pres.addSlide();
  hdr(s3);
  title(s3, "KevaOS Is an Enforcement Engine");
  s3.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.6, w: 4.3, h: 3.4, fill: { color: CARD_ALT }, line: { color: BORDER, width: 0.5 } });
  s3.addText("EVERY OTHER PLATFORM", { x: 0.7, y: 1.7, w: 3.9, h: 0.3, fontSize: 10, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  ["Shows you a chart of labor cost","Suggests a schedule","Alerts you to high food cost","Displays a dashboard","Manager decides whether to act"].forEach((n, i) => {
    s3.addText("—", { x: 0.75, y: 2.15 + i * 0.48, w: 0.3, h: 0.3, fontSize: 12, color: ERR, fontFace: MONO, margin: 0 });
    s3.addText(n, { x: 1.1, y: 2.15 + i * 0.48, w: 3.5, h: 0.3, fontSize: 12, fontFace: FONT, color: MID, margin: 0 });
  });
  s3.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.6, w: 4.3, h: 3.4, fill: { color: BRASS_TINT }, line: { color: BRASS, width: 1 } });
  s3.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.6, w: 0.05, h: 3.4, fill: { color: BRASS } });
  s3.addText("KEVAOS", { x: 5.4, y: 1.7, w: 3.9, h: 0.3, fontSize: 10, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  ["Blocks schedule publication if rails breached","Auto-fires procurement through your supply chain","AI reviews every comp against policy nightly","Requires nightly attestation to close out","System enforces. Manager complies."].forEach((y, i) => {
    s3.addText("→", { x: 5.45, y: 2.15 + i * 0.48, w: 0.3, h: 0.3, fontSize: 12, color: BRASS, fontFace: MONO, bold: true, margin: 0 });
    s3.addText(y, { x: 5.8, y: 2.15 + i * 0.48, w: 3.5, h: 0.3, fontSize: 12, fontFace: FONT, color: SLATE2, bold: i === 4, margin: 0 });
  });
  footerNote(s3, "Keva: the fixed framework. The venue doesn't get a suggestion — it gets permanence.");
  snum(s3, "03");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 4 — ARCHITECTURE
  // ═══════════════════════════════════════════════════════════════
  let s4 = pres.addSlide();
  hdr(s4);
  title(s4, "System Architecture");
  subtitle(s4, "Integrations → data lake → enforcement engine → action.");
  s4.addText("INPUT LAYER", { x: 0.5, y: 1.7, w: 2.5, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  [{ icon: iCog, label: "Toast / Simphony / Upserve" },{ icon: iUsers, label: "7shifts (via TipSee)" },{ icon: iBell, label: "SevenRooms / Tripleseat" },{ icon: iInvoice, label: "Restaurant365" },{ icon: iCamera, label: "UniFi Protect (cameras)" }].forEach((inp, i) => {
    s4.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 2.0 + i * 0.55, w: 2.3, h: 0.45, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s4.addImage({ data: inp.icon, x: 0.6, y: 2.07 + i * 0.55, w: 0.22, h: 0.22 });
    s4.addText(inp.label, { x: 0.9, y: 2.0 + i * 0.55, w: 1.7, h: 0.45, fontSize: 10, fontFace: FONT, color: SLATE3, valign: "middle", margin: 0 });
  });
  for (let i = 0; i < 3; i++) s4.addImage({ data: iArrow, x: 3.05, y: 2.7 + i * 0.6, w: 0.2, h: 0.2 });
  s4.addText("ENFORCEMENT ENGINE", { x: 3.5, y: 1.7, w: 3, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  s4.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 2.0, w: 3.0, h: 2.7, fill: { color: BRASS_TINT }, line: { color: BRASS, width: 1.5 } });
  s4.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 2.0, w: 3.0, h: 0.04, fill: { color: BRASS } });
  ["Labor Rails","Comp Enforcement","Procurement Agent","Rez-Yield Agent","Nightly Attestation","Anomaly Detection"].forEach((e, i) => {
    s4.addText("▸ " + e, { x: 3.7, y: 2.15 + i * 0.4, w: 2.6, h: 0.35, fontSize: 11, fontFace: FONT, color: SLATE2, bold: true, margin: 0 });
  });
  for (let i = 0; i < 3; i++) s4.addImage({ data: iArrow, x: 6.75, y: 2.7 + i * 0.6, w: 0.2, h: 0.2 });
  s4.addText("ACTION LAYER", { x: 7.2, y: 1.7, w: 2.5, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  [{ icon: iBan, label: "Block / Escalate" },{ icon: iTruck, label: "Auto-Order PO" },{ icon: iGavel, label: "Violation Created" },{ icon: iBar, label: "Score Update" },{ icon: iClip, label: "Manager Alert" }].forEach((out, i) => {
    s4.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 2.0 + i * 0.55, w: 2.3, h: 0.45, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s4.addImage({ data: out.icon, x: 7.3, y: 2.07 + i * 0.55, w: 0.22, h: 0.22 });
    s4.addText(out.label, { x: 7.6, y: 2.0 + i * 0.55, w: 1.7, h: 0.45, fontSize: 10, fontFace: FONT, color: SLATE3, valign: "middle", margin: 0 });
  });
  footerNote(s4, "Fail-closed architecture. The fixed framework doesn't ask — it enforces.");
  snum(s4, "04");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 5 — AI AGENTS (FIX: honest status labels)
  // ═══════════════════════════════════════════════════════════════
  let s5 = pres.addSlide();
  hdr(s5);
  title(s5, "Autonomous AI Agents");
  subtitle(s5, "Not dashboards with AI labels. Agents that observe, decide, and act.");
  s5.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.6, w: 9.0, h: 0.6, fill: { color: CARD_ALT } });
  s5.addText([
    { text: "Every agent follows the same loop:  ", options: { fontSize: 12, fontFace: FONT, color: MID } },
    { text: "Observe", options: { fontSize: 12, fontFace: FONT, color: SAGE, bold: true } },
    { text: "  →  ", options: { fontSize: 12, fontFace: FONT, color: DIM } },
    { text: "Evaluate", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 12, fontFace: FONT, color: DIM } },
    { text: "Act", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 12, fontFace: FONT, color: DIM } },
    { text: "Enforce", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
  ], { x: 0.7, y: 1.6, w: 8.6, h: 0.6, valign: "middle", margin: 0 });
  // FIX: Honest status — LIVE for validated, BETA for in-validation, Q2 for upcoming
  const agents = [
    { icon: iRobot, name: "Scheduling Agent", act: "Recommends cuts/call-ins mid-service. Blocks schedule if rails breached.", status: "LIVE", statusColor: GREEN },
    { icon: iGavel, name: "Comp Agent", act: "AI reviews against policy. Creates violations. Escalates automatically.", status: "LIVE", statusColor: GREEN },
    { icon: iClip, name: "Attestation Agent", act: "Requires structured nightly sign-off. Generates violations from variances.", status: "LIVE", statusColor: GREEN },
    { icon: iBell, name: "Rez-Yield Agent", act: "Owns the booking decision. Channels are pipes — KevaOS decides who sits where.", status: "BETA", statusColor: AMBER_TEXT },
    { icon: iCamera, name: "Vision Agent", act: "Detects occupancy from camera snapshots, measures greet times, feeds server scores.", status: "BETA", statusColor: AMBER_TEXT },
    { icon: iTruck, name: "Procurement Agent", act: "Builds POs, routes to Binyan entities, auto-executes under $500.", status: "Q2", statusColor: SAGE },
  ];
  agents.forEach((ag, i) => {
    const iy = 2.35 + i * 0.47;
    s5.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: iy, w: 9.0, h: 0.4, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s5.addImage({ data: ag.icon, x: 0.6, y: iy + 0.07, w: 0.22, h: 0.22 });
    s5.addText(ag.name, { x: 0.9, y: iy, w: 1.7, h: 0.4, fontSize: 10, fontFace: FONT, color: BRASS, bold: true, valign: "middle", margin: 0 });
    s5.addText(ag.act, { x: 2.7, y: iy, w: 5.2, h: 0.4, fontSize: 9, fontFace: FONT, color: SLATE3, valign: "middle", margin: 0 });
    const bgColor = ag.status === "BETA" ? AMBER_BG : (ag.status === "LIVE" ? GREEN : SAGE);
    const txtColor = ag.status === "BETA" ? AMBER_TEXT : WHITE;
    s5.addText(ag.status, { x: 8.2, y: iy + 0.08, w: 0.7, h: 0.22, fontSize: 7, fontFace: FONT, color: txtColor, bold: true, align: "center", fill: { color: bgColor } });
  });
  footerNote(s5, "These aren't features with AI sprinkled on top. They're autonomous agents that take action without waiting for a human.");
  snum(s5, "05");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 6 — LABOR RAILS
  // ═══════════════════════════════════════════════════════════════
  let s6 = pres.addSlide();
  hdr(s6);
  title(s6, "Labor Rails");
  subtitle(s6, "The schedule doesn't publish unless it's within bounds.");
  s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s6.addText("THE 4:30 PM PILE-UP PROBLEM", { x: 0.7, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s6.addText("Modeled on real high-volume restaurant data: all servers scheduled to arrive at the same time. Three hours of excess labor before the dining room fills. $625K/year in wasted payroll at a single venue.", {
    x: 0.7, y: 2.2, w: 3.9, h: 1.0, fontSize: 12, fontFace: FONT, color: MID, lineSpacingMultiple: 1.4, margin: 0
  });
  s6.addText([
    { text: "$625K", options: { fontSize: 34, fontFace: FONT, color: BRASS, bold: true } },
    { text: " /yr savings\nper venue (validated)", options: { fontSize: 13, fontFace: FONT, color: MID } },
  ], { x: 0.7, y: 3.5, w: 3.9, h: 0.9, margin: 0 });
  s6.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s6.addText("HOW LABOR RAILS WORK", { x: 5.4, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  ["Max SPLH by daypart from 7shifts data","Staggered start times enforced","Staff-to-cover ratio by section","Mid-service cut/call-in recommendations","OT threshold alerts before approval","Schedule blocked until rails pass"].forEach((r, i) => {
    s6.addImage({ data: iCheck, x: 5.45, y: 2.25 + i * 0.42, w: 0.2, h: 0.2 });
    s6.addText(r, { x: 5.8, y: 2.2 + i * 0.42, w: 3.5, h: 0.35, fontSize: 11, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  footerNote(s6, "Portfolio-wide labor savings: $1M+ annually across a multi-venue operator.");
  snum(s6, "06");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 7 — COMP ENFORCEMENT (FIX: added dollar anchor)
  // ═══════════════════════════════════════════════════════════════
  let s7 = pres.addSlide();
  hdr(s7);
  title(s7, "Comp Enforcement");
  subtitle(s7, "Every comp reviewed by AI against policy. Every night. No exceptions.");
  s7.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s7.addText("HOW IT WORKS", { x: 0.7, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  [{ n:"1", t:"POS data syncs in real time" },{ n:"2", t:"Every comp flagged against venue policy" },{ n:"3", t:"AI reviews patterns: same server, same reason, consecutive" },{ n:"4", t:"Violations created in control plane" },{ n:"5", t:"Manager must attest nightly — can't skip" }].forEach((cs, i) => {
    s7.addShape(pres.shapes.OVAL, { x: 0.7, y: 2.2 + i * 0.48, w: 0.28, h: 0.28, fill: { color: BRASS } });
    s7.addText(cs.n, { x: 0.7, y: 2.2 + i * 0.48, w: 0.28, h: 0.28, fontSize: 10, fontFace: FONT, color: WHITE, align: "center", valign: "middle", margin: 0 });
    s7.addText(cs.t, { x: 1.1, y: 2.17 + i * 0.48, w: 3.5, h: 0.35, fontSize: 11, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  s7.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s7.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.7, w: 0.04, h: 3.2, fill: { color: OLIVE } });
  s7.addText("POLICY CONTROLS", { x: 5.4, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: OLIVE, bold: true, margin: 0 });
  ["Approved comp reasons with max amounts","Daily comp % warning/critical thresholds","Server-level comp dollar limits","Manager authority tiers","High-value comp auto-escalation","Immutable audit trail (version control)"].forEach((cp, i) => {
    s7.addImage({ data: iCheckOlive, x: 5.45, y: 2.25 + i * 0.42, w: 0.2, h: 0.2 });
    s7.addText(cp, { x: 5.8, y: 2.2 + i * 0.42, w: 3.5, h: 0.35, fontSize: 11, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  // FIX: Added dollar anchor for comp leakage
  s7.addText("Industry benchmark: 2–5% of gross revenue lost to ungoverned comps. At $10M revenue, that's $200–500K/year.", {
    x: 0.7, y: 5.05, w: 8.6, h: 0.35, fontSize: 11, fontFace: FONT, color: SLATE3, italic: true, margin: 0
  });
  snum(s7, "07");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 8 — REZ-YIELD
  // ═══════════════════════════════════════════════════════════════
  let s8 = pres.addSlide();
  hdr(s8);
  title(s8, "KevaOS Is the Booking Engine");
  subtitle(s8, "Resy, OpenTable, SevenRooms become channels. KevaOS owns the decision.");
  s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.6, w: 9.0, h: 0.9, fill: { color: CARD_ALT } });
  ["Resy","OpenTable","SevenRooms","Walk-ins","Phone"].forEach((ch, i) => {
    const cx = 0.7 + i * 1.7;
    s8.addShape(pres.shapes.RECTANGLE, { x: cx, y: 1.7, w: 1.45, h: 0.35, fill: { color: CARD_ALT }, line: { color: BORDER, width: 0.5 } });
    s8.addText(ch, { x: cx, y: 1.7, w: 1.45, h: 0.35, fontSize: 9, fontFace: FONT, color: SLATE3, align: "center", valign: "middle", margin: 0 });
  });
  s8.addText("All channels feed into KevaOS", { x: 0.5, y: 2.15, w: 9.0, h: 0.25, fontSize: 9, fontFace: FONT, color: BRASS, align: "center", margin: 0 });
  s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 2.5, w: 9.0, h: 0.55, fill: { color: BRASS_TINT }, line: { color: BRASS, width: 1 } });
  s8.addText("KEVAOS REZ-YIELD AGENT  —  Accept  ·  Deny  ·  Waitlist  ·  Offer Alternate  ·  Auto-seat", {
    x: 0.7, y: 2.5, w: 8.6, h: 0.55, fontSize: 11, fontFace: FONT, color: SLATE2, bold: true, valign: "middle", align: "center", margin: 0
  });
  s8.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.2, w: 4.3, h: 1.7, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s8.addText("FLOOR PLAN MANAGEMENT", { x: 0.7, y: 3.3, w: 3.9, h: 0.25, fontSize: 10, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  ["Drag-and-drop table layout editor","Section management with staff assignment","Real-time table state machine (7 states)","Turn tracking with duration forecasting","Table combos for large parties"].forEach((ff, i) => {
    s8.addImage({ data: iCheck, x: 0.7, y: 3.65 + i * 0.23, w: 0.16, h: 0.16 });
    s8.addText(ff, { x: 0.95, y: 3.62 + i * 0.23, w: 3.7, h: 0.22, fontSize: 9, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  s8.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 3.2, w: 4.3, h: 1.7, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s8.addText("YIELD OPTIMIZATION", { x: 5.4, y: 3.3, w: 3.9, h: 0.25, fontSize: 10, fontFace: FONT, color: OLIVE, bold: true, margin: 0 });
  ["Per-slot demand + duration forecasting","Stress scoring blocks overbooking","VIP table protection by level","Value delta vs. slot demand (RevPASH)","Backtest policy changes before deploy"].forEach((yf, i) => {
    s8.addImage({ data: iCheckOlive, x: 5.4, y: 3.65 + i * 0.23, w: 0.16, h: 0.16 });
    s8.addText(yf, { x: 5.65, y: 3.62 + i * 0.23, w: 3.7, h: 0.22, fontSize: 9, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  footerNote(s8, "The booking platforms become dumb pipes. KevaOS decides who sits where, when, and at what price.");
  snum(s8, "08");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 9 — PROCUREMENT AGENT
  // ═══════════════════════════════════════════════════════════════
  let s9 = pres.addSlide();
  hdr(s9);
  title(s9, "Procurement Agent");
  subtitle(s9, "Monitors consumption. Builds the PO. Routes through your supply chain. Auto-executes.");
  s9.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.65, w: 9.0, h: 0.65, fill: { color: CARD_ALT } });
  s9.addText([
    { text: "One trigger. Three revenue events:  ", options: { fontSize: 12, fontFace: FONT, color: SLATE3 } },
    { text: "SaaS fee", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  +  ", options: { fontSize: 12, fontFace: FONT, color: DIM } },
    { text: "Product margin", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  +  ", options: { fontSize: 12, fontFace: FONT, color: DIM } },
    { text: "Fulfillment margin", options: { fontSize: 12, fontFace: FONT, color: BRASS, bold: true } },
  ], { x: 0.7, y: 1.65, w: 8.6, h: 0.65, valign: "middle", margin: 0 });
  [{ signal: "Menu item depletion (POS)", entity: "SHW", type: "Ingredient restock" },{ signal: "Packaging burn rate", entity: "Shureprint", type: "Custom packaging" },{ signal: "Cleaning SLA trigger", entity: "GroundOps", type: "Consumables" },{ signal: "Equipment wear / opening", entity: "E&E Mercantile", type: "FF&E, uniforms, OS&E" }].forEach((rt, i) => {
    const ry = 2.55 + i * 0.55;
    s9.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: ry, w: 3.5, h: 0.45, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s9.addText(rt.signal, { x: 0.65, y: ry, w: 3.2, h: 0.45, fontSize: 10, fontFace: FONT, color: SLATE3, valign: "middle", margin: 0 });
    s9.addImage({ data: iArrow, x: 4.15, y: ry + 0.12, w: 0.18, h: 0.18 });
    s9.addShape(pres.shapes.RECTANGLE, { x: 4.5, y: ry, w: 2.2, h: 0.45, fill: { color: BRASS_LIGHT }, line: { color: BRASS, width: 0.5 } });
    s9.addText(rt.entity, { x: 4.5, y: ry, w: 2.2, h: 0.45, fontSize: 11, fontFace: FONT, color: SLATE2, bold: true, align: "center", valign: "middle", margin: 0 });
    s9.addImage({ data: iArrow, x: 6.85, y: ry + 0.12, w: 0.18, h: 0.18 });
    s9.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: ry, w: 2.3, h: 0.45, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s9.addText(rt.type, { x: 7.35, y: ry, w: 2.0, h: 0.45, fontSize: 10, fontFace: FONT, color: MID, valign: "middle", margin: 0 });
  });
  s9.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.55, w: 4.3, h: 0.7, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
  s9.addText([
    { text: "Decision tiers: ", options: { fontSize: 10, fontFace: FONT, color: MID } },
    { text: "Auto (<$500)", options: { fontSize: 10, fontFace: FONT, color: BRASS, bold: true } },
    { text: " · Manager ($500–$2.5K) · Exec ($2.5K+)", options: { fontSize: 10, fontFace: FONT, color: MID } },
  ], { x: 0.65, y: 4.55, w: 4.0, h: 0.7, valign: "middle", margin: 0 });
  s9.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 4.55, w: 4.3, h: 0.7, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
  s9.addText([
    { text: "Anomaly detection: ", options: { fontSize: 10, fontFace: FONT, color: MID } },
    { text: "AI-reviewed", options: { fontSize: 10, fontFace: FONT, color: BRASS, bold: true } },
    { text: " — consumption spikes, price variance, waste patterns.", options: { fontSize: 10, fontFace: FONT, color: MID } },
  ], { x: 5.35, y: 4.55, w: 4.0, h: 0.7, valign: "middle", margin: 0 });
  snum(s9, "09");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 10 — NIGHTLY ATTESTATION
  // ═══════════════════════════════════════════════════════════════
  let s10 = pres.addSlide();
  hdr(s10);
  title(s10, "Attestation & Control Plane");
  subtitle(s10, "The shift doesn't close until the manager explains every variance.");
  s10.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s10.addText("ATTESTATION DOMAINS", { x: 0.7, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  ["Revenue variance (vs. forecast)","Labor cost vs. rails","Comp exceptions","Incidents (guest, equipment, safety)","Coaching notes","Entertainment quality","Culinary (86s, quality, prep)"].forEach((ad, i) => {
    s10.addImage({ data: iCheck, x: 0.7, y: 2.2 + i * 0.37, w: 0.18, h: 0.18 });
    s10.addText(ad, { x: 1.0, y: 2.17 + i * 0.37, w: 3.5, h: 0.3, fontSize: 11, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  s10.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.7, w: 4.3, h: 3.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s10.addText("CONTROL PLANE", { x: 5.4, y: 1.8, w: 3.9, h: 0.3, fontSize: 11, fontFace: FONT, color: OLIVE, bold: true, margin: 0 });
  s10.addText("Every signal flows into a violation state machine with escalation.", {
    x: 5.4, y: 2.15, w: 3.9, h: 0.4, fontSize: 10, fontFace: FONT, color: MID, margin: 0
  });
  ["Violations created automatically","State machine: open → acknowledged → resolved","Escalation flows (manager → exec → platform)","Carry-forward compliance tracking","AI-generated narrative summaries","Nightly email briefing to subscribers"].forEach((cf, i) => {
    s10.addImage({ data: iCheckOlive, x: 5.45, y: 2.65 + i * 0.37, w: 0.18, h: 0.18 });
    s10.addText(cf, { x: 5.75, y: 2.62 + i * 0.37, w: 3.6, h: 0.3, fontSize: 11, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  footerNote(s10, "Variance isn't punished — it's explained. But the requirement to explain is permanent.");
  snum(s10, "10");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 11 — DEMAND FORECASTING & SENSORS
  // ═══════════════════════════════════════════════════════════════
  let s11 = pres.addSlide();
  hdr(s11);
  title(s11, "Demand Forecasting & Sensors");
  subtitle(s11, "Predict demand. Verify execution. Feed the loop.");

  // Forecasting — primary (left, larger)
  s11.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.65, w: 5.5, h: 3.3, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s11.addImage({ data: iBrain, x: 0.7, y: 1.8, w: 0.25, h: 0.25 });
  s11.addText("DEMAND FORECASTING", { x: 1.05, y: 1.78, w: 4, h: 0.3, fontSize: 12, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s11.addText("Covers, revenue, and ingredient demand — predicted daily. Drives labor scheduling, procurement, and prep lists.", {
    x: 0.7, y: 2.15, w: 5.1, h: 0.45, fontSize: 10, fontFace: FONT, color: MID, margin: 0
  });
  ["Daily cover & revenue predictions","Hourly demand curves (day-of-week + events)","Ingredient demand from forecast + recipes","MAPE accuracy tracking per venue","Manager override with reason coding","Auto-generated prep lists from forecast","Rez pacing feeds real-time demand adjustments"].forEach((ff, i) => {
    s11.addImage({ data: iCheck, x: 0.7, y: 2.7 + i * 0.37, w: 0.18, h: 0.18 });
    s11.addText(ff, { x: 1.0, y: 2.67 + i * 0.37, w: 4.8, h: 0.3, fontSize: 10, fontFace: FONT, color: SLATE3, margin: 0 });
  });

  // Sensor layer — secondary (right, smaller)
  s11.addShape(pres.shapes.RECTANGLE, { x: 6.2, y: 1.65, w: 3.3, h: 3.3, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s11.addImage({ data: iCamera, x: 6.4, y: 1.8, w: 0.22, h: 0.22 });
  s11.addText("SENSOR LAYER", { x: 6.7, y: 1.78, w: 2.5, h: 0.3, fontSize: 11, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  s11.addText("Physical verification inputs that feed the enforcement engine.", {
    x: 6.4, y: 2.15, w: 2.9, h: 0.45, fontSize: 9, fontFace: FONT, color: MID, margin: 0
  });
  ["Camera occupancy snapshots","Greeting time measurement","Keva Pin (UWB + audio)","Plating scale integration","POS real-time transaction sync"].forEach((sf, i) => {
    s11.addText("▸ " + sf, { x: 6.4, y: 2.7 + i * 0.35, w: 2.9, h: 0.28, fontSize: 9, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  s11.addText("Sensors provide ground truth. They're one input — not the product.", {
    x: 6.4, y: 4.5, w: 2.9, h: 0.35, fontSize: 8, fontFace: FONT, color: DIM, italic: true, margin: 0
  });

  footerNote(s11, "Forecasting is the brain. Sensors are the eyes. The enforcement engine connects them.");
  snum(s11, "11");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 12 — SERVER SCORE & HOST STAND (FIX: removed exact weight %s)
  // ═══════════════════════════════════════════════════════════════
  let s12 = pres.addSlide();
  hdr(s12);
  title(s12, "Server Score & Host Stand");
  // Server score - left
  s12.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.55, w: 4.3, h: 3.45, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s12.addImage({ data: iStar, x: 0.7, y: 1.7, w: 0.25, h: 0.25 });
  s12.addText("SERVER SCORE", { x: 1.05, y: 1.68, w: 3, h: 0.3, fontSize: 12, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s12.addText("A 0–100 composite from real data — not manager opinion.", { x: 0.7, y: 2.05, w: 3.9, h: 0.35, fontSize: 10, fontFace: FONT, color: MID, margin: 0 });
  // FIX: Removed exact percentages — just inputs with categories
  s12.addText("PERFORMANCE INPUTS", { x: 0.7, y: 2.45, w: 3.9, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  const scoreInputs = [
    "Revenue per cover",
    "Tip % vs. team average",
    "Turn time vs. team average",
    "Comp rate and frequency",
    "Guest review sentiment",
    "Manager attestation notes",
    "Shift-to-shift consistency",
  ];
  scoreInputs.forEach((si, i) => {
    s12.addText("▸ " + si, { x: 0.7, y: 2.75 + i * 0.28, w: 3.9, h: 0.25, fontSize: 10, fontFace: FONT, color: SLATE3, margin: 0 });
  });
  // FIX: Caveat on weights
  s12.addText("Weights tuned per venue from live data. Model improves with each service.", {
    x: 0.7, y: 4.75, w: 3.9, h: 0.2, fontSize: 8, fontFace: FONT, color: DIM, italic: true, margin: 0
  });

  // Host stand - right
  s12.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.55, w: 4.3, h: 3.6, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
  s12.addImage({ data: iDollar, x: 5.4, y: 1.7, w: 0.25, h: 0.25 });
  s12.addText("HOST STAND PLATFORM", { x: 5.75, y: 1.68, w: 3.5, h: 0.3, fontSize: 12, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s12.addText("The only screen at the front door. Prime real estate.", { x: 5.4, y: 2.05, w: 3.9, h: 0.35, fontSize: 10, fontFace: FONT, color: MID, margin: 0 });
  [{ t: "Floor State Machine", d: "Real-time table status from POS + camera. Available, seated, check dropped, bussing — tracked automatically." },
   { t: "Waitlist Management", d: "Full waitlist with wait time estimation, SMS notifications, and seating preference tracking." },
   { t: "Rez-Yield Integration", d: "Seat candidate scoring with operational + predictive adjustments. Accept/deny/offer alternate." },
   { t: "Walk-in Capture", d: "Every walk-in tracked. Party size, preferences, wait time. Feeds demand forecasting." }].forEach((hf, i) => {
    s12.addText(hf.t, { x: 5.4, y: 2.5 + i * 0.57, w: 3.9, h: 0.22, fontSize: 11, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
    s12.addText(hf.d, { x: 5.4, y: 2.72 + i * 0.57, w: 3.9, h: 0.32, fontSize: 9, fontFace: FONT, color: MID, margin: 0 });
  });
  snum(s12, "12");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 12B — THE SIGNAL LOOP
  // ═══════════════════════════════════════════════════════════════
  let s12b = pres.addSlide();
  hdr(s12b);
  title(s12b, "The Signal Loop");
  subtitle(s12b, "Every module feeds the next. The loop tightens with every service.");

  // Circular loop nodes
  const loopNodes = [
    { label: "Reservations", sub: "Demand signal from all channels", icon: iBell },
    { label: "Demand Forecast", sub: "Covers, revenue, ingredient needs", icon: iBrain },
    { label: "Labor Scheduling", sub: "Staff-to-demand matching", icon: iUsers },
    { label: "Procurement", sub: "Auto-PO from forecast + recipes", icon: iTruck },
    { label: "Floor Plan", sub: "Section assignment, table state", icon: iCog },
    { label: "Server Mapping", sub: "Score-based section placement", icon: iStar },
    { label: "Service Execution", sub: "POS + camera ground truth", icon: iCamera },
    { label: "Nightly Close", sub: "Attestation, violations, scores", icon: iGavel },
  ];

  // Layout: 2 rows of 4, with arrows connecting them in a loop
  loopNodes.forEach((node, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const nx = 0.35 + col * 2.4;
    const ny = 1.65 + row * 1.7;
    // Card
    s12b.addShape(pres.shapes.RECTANGLE, { x: nx, y: ny, w: 2.15, h: 1.35, fill: { color: CARD }, shadow: mkShadow(), line: { color: row === 1 && col === 3 ? BRASS : BORDER, width: row === 1 && col === 3 ? 1.5 : 0.5 } });
    // Icon
    s12b.addImage({ data: node.icon, x: nx + 0.12, y: ny + 0.12, w: 0.22, h: 0.22 });
    // Step number
    s12b.addShape(pres.shapes.OVAL, { x: nx + 1.7, y: ny + 0.08, w: 0.3, h: 0.3, fill: { color: BRASS } });
    s12b.addText(String(i + 1), { x: nx + 1.7, y: ny + 0.08, w: 0.3, h: 0.3, fontSize: 10, fontFace: FONT, color: WHITE, align: "center", valign: "middle", bold: true, margin: 0 });
    // Label
    s12b.addText(node.label, { x: nx + 0.12, y: ny + 0.42, w: 1.9, h: 0.3, fontSize: 12, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
    // Sub
    s12b.addText(node.sub, { x: nx + 0.12, y: ny + 0.75, w: 1.9, h: 0.45, fontSize: 9, fontFace: FONT, color: MID, lineSpacingMultiple: 1.3, margin: 0 });
  });

  // Arrows between top row cards (right-pointing)
  for (let i = 0; i < 3; i++) {
    s12b.addImage({ data: iArrow, x: 2.35 + i * 2.4, y: 2.2, w: 0.2, h: 0.2 });
  }
  // Arrow from top-right down to bottom-right
  s12b.addText("↓", { x: 8.55, y: 2.95, w: 0.3, h: 0.4, fontSize: 18, fontFace: MONO, color: BRASS, align: "center", margin: 0 });
  // Arrows between bottom row cards (left-pointing — reverse order)
  for (let i = 0; i < 3; i++) {
    s12b.addText("←", { x: 7.15 - i * 2.4, y: 3.9, w: 0.3, h: 0.3, fontSize: 16, fontFace: MONO, color: BRASS, align: "center", margin: 0 });
  }
  // Arrow from bottom-left back up to top-left (completing the loop)
  s12b.addText("↑", { x: 0.55, y: 2.95, w: 0.3, h: 0.4, fontSize: 18, fontFace: MONO, color: BRASS, align: "center", margin: 0 });

  footerNote(s12b, "Pre-shift briefs are generated from real signals — not yesterday's guesses. The loop gets tighter every night.");
  snum(s12b, "13");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 13 — COMPETITIVE (FIX: added Restaurant365)
  // ═══════════════════════════════════════════════════════════════
  let s13 = pres.addSlide();
  hdr(s13);
  title(s13, "Competitive Landscape");
  const compH = [
    { text: "", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "left" } },
    { text: "Toast", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
    { text: "Nory\n($63M)", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
    { text: "R365", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
    { text: "7shifts", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
    { text: "BarVision", options: { fill: { color: CARD_ALT }, color: MID, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
    { text: "KevaOS", options: { fill: { color: BRASS_LIGHT }, color: SLATE, fontSize: 8, fontFace: FONT, bold: true, align: "center" } },
  ];
  // FIX: Added Restaurant365 column
  const compF = [
    ["Enforcement (not advisory)","—","—","—","—","—","✓"],
    ["AI comp review","—","—","—","—","—","✓"],
    ["Camera-based ground truth","—","—","—","—","—","✓"],
    ["Rez yield optimization","—","—","—","—","—","✓"],
    ["Server performance score","—","—","—","—","—","✓"],
    ["Integrated supply chain","—","—","—","—","—","✓"],
    ["Labor schedule enforcement","—","Suggest","—","Suggest","—","Block"],
    ["Procurement automation","—","—","Partial","—","—","✓"],
    ["Nightly attestation","—","—","—","—","—","✓"],
    ["Multi-venue benchmarking","Basic","Partial","Basic","—","—","✓"],
  ];
  const compRows = compF.map(row => row.map((cell, ci) => {
    const isY = cell === "✓" || cell === "Block";
    return { text: cell, options: { fill: { color: WHITE }, color: ci === 0 ? SLATE2 : (isY ? BRASS : (cell === "—" ? DIM : SAGE)), fontSize: ci === 0 ? 8 : 9, fontFace: FONT, bold: isY, align: ci === 0 ? "left" : "center" } };
  }));
  s13.addTable([compH, ...compRows], {
    x: 0.3, y: 1.35, w: 9.4, colW: [2.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.2],
    rowH: [0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32],
    border: { pt: 0.5, color: BORDER }, margin: [2, 3, 2, 3],
  });
  s13.addText("Nory is a dashboard with $63M. R365 is accounting with AI features. KevaOS is an enforcement engine with integrated fulfillment.", {
    x: 0.5, y: 5.0, w: 9.0, h: 0.4, fontSize: 10, fontFace: FONT, color: SLATE3, italic: true, margin: 0
  });
  snum(s13, "14");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 14 — RESULTS (FIX: split Validated vs Modeled)
  // ═══════════════════════════════════════════════════════════════
  let s14 = pres.addSlide();
  hdr(s14);
  title(s14, "Results");

  // Validated row
  s14.addText("VALIDATED IN PRODUCTION", { x: 0.5, y: 1.35, w: 9, h: 0.25, fontSize: 9, fontFace: FONT, color: GREEN, bold: true, margin: 0 });
  [{ stat: "$625K", label: "Labor savings per venue / year", desc: "Staggered scheduling eliminates the pre-service pile-up. Measured across multiple high-volume venues." },
   { stat: "$2M+", label: "Total annual savings identified", desc: "Labor staggering, comp enforcement, CC processing, software consolidation across portfolio." }].forEach((r, i) => {
    const rx = 0.5 + i * 4.6;
    s14.addShape(pres.shapes.RECTANGLE, { x: rx, y: 1.65, w: 4.3, h: 1.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: GREEN, width: 1 } });
    s14.addText(r.stat, { x: rx + 0.2, y: 1.7, w: 2, h: 0.5, fontSize: 32, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
    s14.addText(r.label, { x: rx + 0.2, y: 2.2, w: 3.9, h: 0.22, fontSize: 11, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
    s14.addText(r.desc, { x: rx + 0.2, y: 2.45, w: 3.9, h: 0.3, fontSize: 9, fontFace: FONT, color: MID, margin: 0 });
  });

  // Modeled row
  s14.addText("MODELED FROM LIVE DATA", { x: 0.5, y: 3.1, w: 9, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  [{ stat: "15–30%", label: "Missed revenue per seat-hour", desc: "Suboptimal seating decisions, undertimed turns, and unpriced walk-in demand leave money on the table." },
   { stat: "8–15%", label: "Procurement savings potential", desc: "Anomaly detection, vendor consolidation, and auto-routing through preferred supply chain." }].forEach((r, i) => {
    const rx = 0.5 + i * 4.6;
    s14.addShape(pres.shapes.RECTANGLE, { x: rx, y: 3.4, w: 4.3, h: 1.2, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
    s14.addText(r.stat, { x: rx + 0.2, y: 3.45, w: 2, h: 0.5, fontSize: 32, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
    s14.addText(r.label, { x: rx + 0.2, y: 3.95, w: 3.9, h: 0.22, fontSize: 11, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
    s14.addText(r.desc, { x: rx + 0.2, y: 4.2, w: 3.9, h: 0.3, fontSize: 9, fontFace: FONT, color: MID, margin: 0 });
  });
  footerNote(s14, "Green border = validated in production. Gray border = modeled from live venue data, pending full deployment.");
  snum(s14, "15");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 15 — THE MOAT
  // ═══════════════════════════════════════════════════════════════
  let s15 = pres.addSlide();
  hdr(s15);
  title(s15, "The Moat");
  subtitle(s15, "Software + supply chain + ground truth. Nobody else owns all three.");
  [{ title: "SOFTWARE", sub: "KevaOS Enforcement Engine", color: BRASS, items: ["Labor rails","Comp enforcement","Procurement agent","Rez-yield optimization","Nightly attestation","Multi-venue benchmarks"] },
   { title: "SUPPLY CHAIN", sub: "The Binyan Group Entities", color: OLIVE, items: ["SHW (B2B distributor)","Shureprint (packaging)","E&E Mercantile (FF&E/sourcing)","GroundOps (facilities mgmt)","Procurement auto-routes here","Margin on every PO"] },
   { title: "GROUND TRUTH", sub: "Verification Layer", color: UMBER, items: ["AI camera vision (UniFi)","Greeting time detection","POS real-time sync","7shifts labor data","Keva Pin (UWB + audio)","Server score from real data"] }].forEach((pl, i) => {
    const plx = 0.4 + i * 3.15;
    s15.addShape(pres.shapes.RECTANGLE, { x: plx, y: 1.65, w: 2.95, h: 3.45, fill: { color: CARD }, shadow: mkShadow(), line: { color: BORDER, width: 0.5 } });
    s15.addShape(pres.shapes.RECTANGLE, { x: plx, y: 1.65, w: 2.95, h: 0.03, fill: { color: pl.color } });
    s15.addText(pl.title, { x: plx + 0.15, y: 1.78, w: 2.65, h: 0.3, fontSize: 11, fontFace: FONT, color: pl.color, bold: true, charSpacing: 2, margin: 0 });
    s15.addText(pl.sub, { x: plx + 0.15, y: 2.05, w: 2.65, h: 0.25, fontSize: 10, fontFace: FONT, color: SLATE3, margin: 0 });
    s15.addShape(pres.shapes.LINE, { x: plx + 0.15, y: 2.4, w: 2.0, h: 0, line: { color: BORDER, width: 1 } });
    pl.items.forEach((item, j) => {
      s15.addText("▸ " + item, { x: plx + 0.15, y: 2.5 + j * 0.35, w: 2.65, h: 0.3, fontSize: 10, fontFace: FONT, color: MID, margin: 0 });
    });
  });
  s15.addText("Replacing KevaOS means replacing your distributor, print vendor, facilities company, AND operating system. That's permanence.", {
    x: 0.5, y: 5.0, w: 9.0, h: 0.4, fontSize: 11, fontFace: FONT, color: SLATE3, italic: true, margin: 0
  });
  snum(s15, "16");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 16 — REVENUE MODEL (FIX: merged lifecycle + model into one slide)
  // ═══════════════════════════════════════════════════════════════
  let s16 = pres.addSlide();
  hdr(s16);
  title(s16, "Revenue Model");
  // Lifecycle strip at top
  s16.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.45, w: 9.0, h: 0.55, fill: { color: BRASS_TINT }, line: { color: BRASS, width: 0.5 } });
  s16.addText([
    { text: "Book", options: { fontSize: 11, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 11, fontFace: FONT, color: DIM } },
    { text: "Staff", options: { fontSize: 11, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 11, fontFace: FONT, color: DIM } },
    { text: "Serve", options: { fontSize: 11, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 11, fontFace: FONT, color: DIM } },
    { text: "Close", options: { fontSize: 11, fontFace: FONT, color: BRASS, bold: true } },
    { text: "  →  ", options: { fontSize: 11, fontFace: FONT, color: DIM } },
    { text: "Restock", options: { fontSize: 11, fontFace: FONT, color: BRASS, bold: true } },
    { text: "    Revenue captured at every stage. No other platform manages the full lifecycle.", options: { fontSize: 10, fontFace: FONT, color: SLATE3 } },
  ], { x: 0.7, y: 1.45, w: 8.6, h: 0.55, valign: "middle", margin: 0 });

  // Three revenue layers
  s16.addText("THREE REVENUE LAYERS PER VENUE", { x: 0.7, y: 2.2, w: 8, h: 0.25, fontSize: 9, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
  [{ layer:"1", name:"SaaS", desc:"KevaOS platform fee per venue/month. Enforcement engine, attestation, scoring, dashboards.", ex:"$2–5K/mo per venue" },
   { layer:"2", name:"Procurement Margin", desc:"Every PO routed through Binyan entities generates product margin. SHW, Shureprint, E&E, GroundOps.", ex:"15–35% on flow-through" },
   { layer:"3", name:"Hardware", desc:"Sensor mesh, cameras, scales, Keva Pins — sold or leased. Ongoing replacement and expansion.", ex:"$1–3K initial + ongoing" }].forEach((rl, i) => {
    const rly = 2.6 + i * 0.85;
    s16.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: rly, w: 9.0, h: 0.72, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
    s16.addShape(pres.shapes.OVAL, { x: 0.7, y: rly + 0.15, w: 0.38, h: 0.38, fill: { color: BRASS } });
    s16.addText(rl.layer, { x: 0.7, y: rly + 0.15, w: 0.38, h: 0.38, fontSize: 14, fontFace: FONT, color: WHITE, align: "center", valign: "middle", bold: true, margin: 0 });
    s16.addText(rl.name, { x: 1.25, y: rly + 0.06, w: 2.5, h: 0.28, fontSize: 13, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
    s16.addText(rl.desc, { x: 1.25, y: rly + 0.38, w: 5, h: 0.26, fontSize: 10, fontFace: FONT, color: MID, margin: 0 });
    s16.addText(rl.ex, { x: 7.0, y: rly + 0.06, w: 2.3, h: 0.6, fontSize: 12, fontFace: FONT, color: BRASS, bold: true, align: "right", valign: "middle", margin: 0 });
  });
  s16.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 5.0, w: 9.0, h: 0.4, fill: { color: BRASS_TINT }, line: { color: BRASS, width: 0.5 } });
  s16.addText("Nory gets one revenue event. KevaOS gets three. On every transaction. At every venue.", {
    x: 0.7, y: 5.0, w: 8.6, h: 0.4, fontSize: 12, fontFace: FONT, color: SLATE2, bold: true, valign: "middle", margin: 0
  });
  snum(s16, "17");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 17 — INTEGRATIONS (kept but tightened)
  // ═══════════════════════════════════════════════════════════════
  let s17 = pres.addSlide();
  hdr(s17);
  title(s17, "Integration Layer");
  subtitle(s17, "Plugs into what venues already run. No rip-and-replace.");
  [{ cat: "POS SYSTEMS", items: [
    { name: "Toast", status: "Ready", desc: "Direct API. Intra-day summaries." },
    { name: "Oracle Simphony", status: "Live", desc: "Via TipSee + BI API." },
    { name: "Upserve", status: "Live", desc: "Via TipSee. Real-time checks." },
    { name: "Square / Lightspeed", status: "Ready", desc: "Available for new venues." },
  ]},{ cat: "OPERATIONS", items: [
    { name: "7shifts", status: "Live", desc: "Punches, wages via TipSee." },
    { name: "SevenRooms", status: "Live", desc: "Reservations + schedules." },
    { name: "Restaurant365", status: "Live", desc: "GL accounts, COGS." },
    { name: "UniFi Protect", status: "Live", desc: "Camera → AI vision." },
  ]}].forEach((group, gi) => {
    const gx = 0.5 + gi * 4.6;
    s17.addText(group.cat, { x: gx, y: 1.65, w: 4.3, h: 0.3, fontSize: 10, fontFace: FONT, color: SAGE, bold: true, margin: 0 });
    group.items.forEach((item, i) => {
      const iy = 2.0 + i * 0.6;
      s17.addShape(pres.shapes.RECTANGLE, { x: gx, y: iy, w: 4.3, h: 0.5, fill: { color: CARD }, line: { color: BORDER, width: 0.5 } });
      s17.addText(item.name, { x: gx + 0.15, y: iy, w: 1.5, h: 0.5, fontSize: 11, fontFace: FONT, color: SLATE, bold: true, valign: "middle", margin: 0 });
      const statusColor = item.status === "Live" ? GREEN : BRASS;
      s17.addText(item.status, { x: gx + 1.6, y: iy + 0.12, w: 0.6, h: 0.25, fontSize: 8, fontFace: FONT, color: WHITE, bold: true, align: "center", fill: { color: statusColor } });
      s17.addText(item.desc, { x: gx + 2.3, y: iy, w: 1.85, h: 0.5, fontSize: 9, fontFace: FONT, color: MID, valign: "middle", margin: 0 });
    });
  });
  footerNote(s17, "KevaOS wraps existing infrastructure. Venues keep their POS — we add the enforcement layer on top.");
  snum(s17, "18");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 18 — ROADMAP
  // ═══════════════════════════════════════════════════════════════
  let s18 = pres.addSlide();
  hdr(s18);
  title(s18, "Roadmap");
  [{ phase:"NOW", title:"Enforcement\nEngine", timeline:"Live", items:["Labor rails deployed","Comp enforcement live","Nightly attestation","Camera vision pipeline","Rez-yield agent (beta)"] },
   { phase:"Q2", title:"Hardware +\nProcurement", timeline:"2026", items:["Keva Pin V1 (UWB)","Radar mesh pilot","Plating scale pilots","Procurement agent live"] },
   { phase:"Q3", title:"Voice +\nScoring", timeline:"2026", items:["Keva Pin V2 (audio + POS)","Voice-to-POS pipeline","Server score network","Recipe auto-generation"] },
   { phase:"2027", title:"External\nExpansion", timeline:"", items:["First external customer","Benchmarking product","Server reputation network","Series A"] }].forEach((ph, i) => {
    const phx = 0.35 + i * 2.4;
    const isCurrent = ph.phase === "NOW";
    const isLast = ph.phase === "2027";
    s18.addShape(pres.shapes.RECTANGLE, { x: phx, y: 1.55, w: 2.25, h: 3.55, fill: { color: isLast ? BRASS_TINT : CARD }, shadow: mkShadow(), line: { color: isLast ? BRASS : (isCurrent ? BRASS : BORDER), width: isCurrent ? 1.5 : 0.5 } });
    if (isCurrent) s18.addShape(pres.shapes.RECTANGLE, { x: phx, y: 1.55, w: 2.25, h: 0.04, fill: { color: BRASS } });
    s18.addText(ph.phase, { x: phx + 0.12, y: 1.65, w: 1.0, h: 0.3, fontSize: 12, fontFace: FONT, color: isLast ? BRASS : (isCurrent ? BRASS : SLATE2), bold: true, margin: 0 });
    if (ph.timeline) s18.addText(ph.timeline, { x: phx + 1.1, y: 1.67, w: 1.0, h: 0.25, fontSize: 9, fontFace: FONT, color: isLast ? SLATE3 : DIM, align: "right", margin: 0 });
    s18.addText(ph.title, { x: phx + 0.12, y: 2.0, w: 2.0, h: 0.5, fontSize: 12, fontFace: FONT, color: SLATE, bold: true, lineSpacingMultiple: 1.2, margin: 0 });
    s18.addShape(pres.shapes.LINE, { x: phx + 0.12, y: 2.6, w: 1.5, h: 0, line: { color: BORDER, width: 1 } });
    ph.items.forEach((item, j) => {
      s18.addText("▸ " + item, { x: phx + 0.12, y: 2.7 + j * 0.38, w: 2.0, h: 0.3, fontSize: 10, fontFace: FONT, color: MID, margin: 0 });
    });
  });
  snum(s18, "19");

  // ═══════════════════════════════════════════════════════════════
  // SLIDE 19 — CLOSING
  // ═══════════════════════════════════════════════════════════════
  let s19 = pres.addSlide();
  s19.background = { color: WHITE };
  s19.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: BRASS } });
  s19.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 1.0, w: 0.06, h: 2.0, fill: { color: BRASS } });
  // Logo: K mark stacked above wordmark
  s19.addImage({ data: kMarkBrass, x: 1.1, y: 0.2, w: 0.3, h: 0.42 });
  s19.addText([
    { text: "Keva", options: { fontSize: 14, fontFace: FONT, color: SLATE, bold: true, charSpacing: 2 } },
    { text: "OS", options: { fontSize: 14, fontFace: FONT, color: BRASS, bold: false, charSpacing: 2 } },
  ], { x: 1.1, y: 0.64, w: 2, h: 0.3, margin: 0 });
  s19.addText([
    { text: "Keva ", options: { fontSize: 14, fontFace: FONT, color: BRASS, italic: true } },
    { text: "  —  permanence, fixity, establishment.", options: { fontSize: 14, fontFace: FONT, color: SAGE, italic: true } },
  ], { x: 1.1, y: 0.85, w: 7, h: 0.35, margin: 0 });
  s19.addText("Every month KevaOS runs,", { x: 1.1, y: 1.4, w: 8.5, h: 0.6, fontSize: 28, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
  s19.addText("the venue loses muscle memory", { x: 1.1, y: 1.9, w: 8.5, h: 0.6, fontSize: 28, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
  s19.addText("for doing things manually.", { x: 1.1, y: 2.4, w: 8.5, h: 0.6, fontSize: 28, fontFace: FONT, color: SLATE, bold: true, margin: 0 });
  s19.addText("That's not lock-in through a contract.", { x: 1.1, y: 3.3, w: 8.5, h: 0.45, fontSize: 18, fontFace: FONT, color: SAGE, margin: 0 });
  s19.addText("That's lock-in through permanence.", { x: 1.1, y: 3.7, w: 8.5, h: 0.45, fontSize: 18, fontFace: FONT, color: BRASS, bold: true, margin: 0 });
  s19.addText("The fixed framework becomes the way the venue operates.", { x: 1.1, y: 4.1, w: 8.5, h: 0.45, fontSize: 18, fontFace: FONT, color: SLATE3, margin: 0 });
  s19.addText("And permanence is the only moat that deepens with time.", { x: 1.1, y: 4.5, w: 8.5, h: 0.45, fontSize: 18, fontFace: FONT, color: SLATE3, margin: 0 });
  // Footer with logo lockup
  s19.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: CARD_ALT } });
  s19.addText([
    { text: "Keva", options: { fontSize: 8, fontFace: FONT, color: SLATE, bold: true } },
    { text: "OS", options: { fontSize: 8, fontFace: FONT, color: BRASS } },
    { text: "  |  THE BINYAN GROUP  |  CONFIDENTIAL", options: { fontSize: 8, fontFace: FONT, color: SAGE } },
  ], { x: 0.5, y: 5.25, w: 5, h: 0.3, valign: "middle", margin: 0 });

  // Write
  await pres.writeFile({ fileName: "kevaos_v4.pptx" });
  console.log(`Done: ${pres.slides.length} slides`);
}

main().catch(console.error);
