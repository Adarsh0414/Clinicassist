import PDFDocument from "pdfkit";

interface PrescriptionItem {
  medication: string;
  strength?: string;
  dosage: string;
  frequencyPerDay: number;
  durationDays: number;
  foodTiming?: string;
  instructions?: string;
}

interface PrescriptionPdfInput {
  patientName: string;
  patientBloodGroup?: string | null;
  patientAllergies?: string | null;
  doctorName: string;
  specialization: string;
  qualifications?: string | null;
  visitDate: Date;
  diagnosis: string;
  prescription: PrescriptionItem[];
  followUpRecommended: boolean;
  followUpAfterDays?: number | null;
  appointmentId: string;
}

// Brand palette — kept in sync with the app's teal/amber/coral/ink tokens (tailwind.config.js)
// so a downloaded PDF still reads as the same product as the web app.
const TEAL = "#2F6E62";
const TEAL_DARK = "#1F4D44";
const TEAL_LIGHT = "#E8F1EE";
const INK = "#1E2A28";
const MUTED = "#6b7a77";
const LINE = "#DCE3E0";
const AMBER = "#B8792B";
const AMBER_LIGHT = "#FBF1E1";
const PAGE_W = 595.28; // A4 @ 72dpi
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Draws the ClinicAssist mark — a teal roundel with a medical cross and a small
 *  heartbeat trace beneath it — as vector paths, so it renders identically everywhere
 *  without depending on font glyph coverage or an external image asset. */
function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size = 30) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  doc.save();
  doc.circle(cx, cy, r).fill(TEAL);
  // medical cross, cut out in white
  const armW = size * 0.16;
  const armL = size * 0.5;
  doc
    .fillColor("#FFFFFF")
    .rect(cx - armW / 2, cy - armL / 2, armW, armL)
    .fill();
  doc
    .fillColor("#FFFFFF")
    .rect(cx - armL / 2, cy - armW / 2, armL, armW)
    .fill();
  doc.restore();
}

/** A thin heartbeat/EKG trace used as a recurring brand motif on section dividers. */
function drawPulseLine(doc: PDFKit.PDFDocument, x: number, y: number, width: number, color = TEAL) {
  const midX = x + width * 0.42;
  doc
    .save()
    .strokeColor(color)
    .lineWidth(1.3)
    .moveTo(x, y)
    .lineTo(midX, y)
    .lineTo(midX + 7, y - 9)
    .lineTo(midX + 14, y + 11)
    .lineTo(midX + 21, y)
    .lineTo(x + width, y)
    .stroke()
    .restore();
}

function formatFoodTiming(timing?: string) {
  if (timing === "after") return "After food";
  if (timing === "before") return "Before food";
  return "Anytime";
}

/** Renders a print-ready, letterhead-style prescription PDF and resolves with the file as
 *  a Buffer. Two pages max in practice (long prescriptions overflow to a continuation
 *  page automatically via PDFKit's flowing text + page-break guard below). */
export function generatePrescriptionPdf(input: PrescriptionPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      addFootersToAllPages(doc, input.appointmentId);
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    // ---- Header band ----
    const HEADER_H = 108;
    doc.rect(0, 0, PAGE_W, HEADER_H).fill(TEAL_LIGHT);
    doc.rect(0, HEADER_H - 4, PAGE_W, 4).fill(TEAL);

    drawLogo(doc, MARGIN, 26, 34);
    doc
      .fillColor(TEAL_DARK)
      .font("Helvetica-Bold")
      .fontSize(21)
      .text("ClinicAssist", MARGIN + 44, 28);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8.5)
      .text("Smart Healthcare Appointment & Follow-up Management", MARGIN + 44, 52);

    doc
      .fillColor(TEAL_DARK)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("PRESCRIPTION", 0, 30, { width: PAGE_W - MARGIN, align: "right" });
    const dateLabel = input.visitDate.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(`Visit date: ${dateLabel}`, 0, 52, { width: PAGE_W - MARGIN, align: "right" });
    doc.text(`Ref: ${input.appointmentId.slice(0, 10).toUpperCase()}`, 0, 65, { width: PAGE_W - MARGIN, align: "right" });

    drawPulseLine(doc, MARGIN + 44, 78, 220, TEAL);

    let y = HEADER_H + 24;

    // ---- Doctor / patient info cards ----
    const cardW = (CONTENT_W - 16) / 2;
    const cardH = 78;
    doc.roundedRect(MARGIN, y, cardW, cardH, 6).fillAndStroke("#FFFFFF", LINE);
    doc.roundedRect(MARGIN + cardW + 16, y, cardW, cardH, 6).fillAndStroke("#FFFFFF", LINE);

    doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(8).text("ATTENDING DOCTOR", MARGIN + 14, y + 12);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(`Dr. ${input.doctorName}`, MARGIN + 14, y + 26);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(`${input.specialization}${input.qualifications ? " · " + input.qualifications : ""}`, MARGIN + 14, y + 44, {
        width: cardW - 28,
      });

    const px = MARGIN + cardW + 16 + 14;
    doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(8).text("PATIENT", px, y + 12);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(input.patientName, px, y + 26);
    const patientMeta = [input.patientBloodGroup ? `Blood group: ${input.patientBloodGroup}` : null].filter(Boolean).join("  ·  ");
    if (patientMeta) doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(patientMeta, px, y + 44, { width: cardW - 28 });
    if (input.patientAllergies) {
      doc
        .fillColor("#B54444")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(`⚠ Allergies: ${input.patientAllergies}`, px, y + (patientMeta ? 58 : 44), { width: cardW - 28 });
    }

    y += cardH + 22;

    // ---- Diagnosis ----
    if (input.diagnosis) {
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text("Diagnosis & Clinical Notes", MARGIN, y);
      y += 16;
      doc
        .roundedRect(MARGIN, y, CONTENT_W, 4, 0)
        .fill(TEAL_LIGHT); // subtle top accent strip above the note box (visual only)
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(input.diagnosis, MARGIN, y + 10, { width: CONTENT_W });
      y = doc.y + 20;
    }

    // ---- Prescription table ----
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text("Rx  ·  Prescription", MARGIN, y);
    y += 18;

    const col = { medicine: MARGIN, strength: MARGIN + 158, dosage: MARGIN + 220, freq: MARGIN + 288, duration: MARGIN + 348, timing: MARGIN + 398 };
    const rowH = 22;

    function tableHeader() {
      doc.rect(MARGIN, y, CONTENT_W, rowH).fill(TEAL);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);
      doc.text("MEDICINE", col.medicine + 8, y + 7);
      doc.text("STRENGTH", col.strength, y + 7);
      doc.text("DOSAGE", col.dosage, y + 7);
      doc.text("FREQ.", col.freq, y + 7);
      doc.text("DAYS", col.duration, y + 7);
      doc.text("TIMING", col.timing, y + 7, { width: PAGE_W - MARGIN - col.timing });
      y += rowH;
    }
    tableHeader();

    doc.font("Helvetica").fontSize(9);
    input.prescription.forEach((item, idx) => {
      const noteLines = item.instructions ? doc.heightOfString(item.instructions, { width: CONTENT_W - 16 }) : 0;
      const thisRowH = Math.max(rowH, 16 + (item.instructions ? noteLines + 10 : 0));

      if (y + thisRowH > 760) {
        doc.addPage();
        y = MARGIN + 10;
        tableHeader();
      }

      if (idx % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, thisRowH).fill(TEAL_LIGHT);
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(item.medication, col.medicine + 8, y + 6, { width: 145 });
      doc.font("Helvetica").fillColor(INK).fontSize(9);
      doc.text(item.strength ?? "—", col.strength, y + 6, { width: 58 });
      doc.text(item.dosage, col.dosage, y + 6, { width: 64 });
      doc.text(`${item.frequencyPerDay}x/day`, col.freq, y + 6, { width: 56 });
      doc.text(`${item.durationDays}d`, col.duration, y + 6, { width: 46 });
      doc.text(formatFoodTiming(item.foodTiming), col.timing, y + 6, { width: PAGE_W - MARGIN - col.timing - 8 });

      if (item.instructions) {
        doc
          .fillColor(MUTED)
          .font("Helvetica-Oblique")
          .fontSize(8)
          .text(`Note: ${item.instructions}`, col.medicine + 8, y + 20, { width: CONTENT_W - 16 });
      }

      doc.strokeColor(LINE).lineWidth(0.5).moveTo(MARGIN, y + thisRowH).lineTo(MARGIN + CONTENT_W, y + thisRowH).stroke();
      y += thisRowH;
    });
    y += 18;

    // ---- Follow-up callout ----
    if (input.followUpRecommended && input.followUpAfterDays) {
      const boxH = 30;
      if (y + boxH > 740) {
        doc.addPage();
        y = MARGIN + 10;
      }
      doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 6).fillAndStroke(AMBER_LIGHT, "#EBD5AE");
      doc
        .fillColor(AMBER)
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text(`↻  Follow-up recommended in approximately ${input.followUpAfterDays} day(s).`, MARGIN + 12, y + 10);
      y += boxH + 20;
    } else {
      y += 4;
    }

    // ---- Signature ----
    const sigW = 190;
    let sigY = Math.max(y, 660);
    if (sigY > 740) {
      doc.addPage();
      sigY = MARGIN + 10;
    }
    const sigX = PAGE_W - MARGIN - sigW;
    doc
      .fillColor(TEAL_DARK)
      .font("Helvetica-Oblique")
      .fontSize(14)
      .text(`Dr. ${input.doctorName}`, sigX, sigY, { width: sigW, align: "center" });
    doc.moveTo(sigX, sigY + 22).lineTo(sigX + sigW, sigY + 22).strokeColor(LINE).lineWidth(1).stroke();
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(`Doctor's signature${input.qualifications ? ` · ${input.qualifications}` : ""}`, sigX, sigY + 28, { width: sigW, align: "center" });

    doc.end();
  });
}

/** Adds an identical footer band to every page after the document is fully composed —
 *  simpler and more reliable than tracking page count while streaming content. */
function addFootersToAllPages(doc: PDFKit.PDFDocument, appointmentId: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = 802;
    doc.rect(0, footerY, PAGE_W, 40).fill(TEAL_LIGHT);
    doc.rect(0, footerY, PAGE_W, 2).fill(TEAL);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(
        "This is a computer-generated prescription issued via ClinicAssist and is not valid without the attending doctor's countersignature where required by local regulation. Not a substitute for in-person emergency care.",
        MARGIN,
        footerY + 9,
        { width: PAGE_W - MARGIN * 2, align: "center" }
      );
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Generated by ClinicAssist  ·  Ref ${appointmentId.slice(0, 10).toUpperCase()}  ·  Page ${i - range.start + 1} of ${range.count}`,
        MARGIN,
        footerY + 24,
        { width: PAGE_W - MARGIN * 2, align: "center" }
      );
  }
}
