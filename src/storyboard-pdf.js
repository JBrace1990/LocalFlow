import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { parseExportOutputPath } from './timeline-export.js';

const text = value => String(value ?? '');

export async function renderStoryboardPdf(project, { imageForScene = async () => null, exportedOn = new Date().toLocaleDateString() } = {}) {
  const shots = Array.isArray(project?.shots) ? project.shots : [];
  if (!shots.length) throw new Error('Add at least one scene before exporting the storyboard.');

  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: false, info: { Title: `${text(project.name || 'Untitled story')} · Storyboard`, Author: 'Local Flow' } });
  const chunks = [];
  const pdf = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  for (let index = 0; index < shots.length; index++) {
    const scene = shots[index] || {};
    if (index) doc.addPage();
    doc.font('Helvetica').fontSize(9).fillColor('#536174').text('LOCAL FLOW  ·  STORYBOARD', { characterSpacing: 1.1 });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(23).fillColor('#172033').text(text(project.name || 'Untitled story'));
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text(`${text(project.kind || 'Project')}  ·  ${shots.length} scenes  ·  Exported ${text(exportedOn)}`);
    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#315fb3').text(`SCENE ${String(index + 1).padStart(2, '0')}  ·  ${text(scene.id)}`, { characterSpacing: 0.8 });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#172033').text(text(scene.title || `Scene ${index + 1}`), { continued: true });
    doc.font('Helvetica').fontSize(10).fillColor('#536174').text(`    ${text(scene.duration || '')}`);
    doc.moveDown(0.8);

    let embedded = false;
    if (scene.image) {
      try {
        const image = await imageForScene(scene.image, scene);
        if (image?.length) {
          doc.image(image, { fit: [pageWidth, 360], align: 'center', valign: 'center' });
          embedded = true;
        }
      } catch {}
    }
    if (!embedded) {
      doc.save().rect(doc.x, doc.y, pageWidth, 110).fill('#f0f2f5').restore();
      doc.font('Helvetica').fontSize(11).fillColor('#727987').text(scene.image ? 'Keyframe could not be loaded' : 'No keyframe selected', doc.x, doc.y + 46, { width: pageWidth, align: 'center' });
      doc.y += 126;
    } else doc.moveDown(0.9);

    if (scene.description) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#172033').text('Scene description');
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(10).fillColor('#323844').text(text(scene.description), { width: pageWidth, lineGap: 2 });
      doc.moveDown(0.8);
    }
    if (scene.prompt) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#172033').text('Image prompt');
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(9).fillColor('#3c4350').text(text(scene.prompt), { width: pageWidth, lineGap: 2 });
    }
  }
  doc.end();
  return pdf;
}

export async function writeStoryboardPdf(project, filePath, options = {}) {
  const target = parseExportOutputPath(filePath, 'pdf');
  if (!target) throw new Error('Choose an absolute save path ending in .pdf.');
  const output = path.join(target.destination, target.filename);
  const buffer = await renderStoryboardPdf(project, options);
  await fs.mkdir(target.destination, { recursive: true });
  await fs.writeFile(output, buffer);
  const stat = await fs.stat(output);
  if (stat.size < 100) {
    await fs.rm(output, { force: true });
    throw new Error('The storyboard PDF was empty and could not be saved.');
  }
  return { path: output, name: target.filename, bytes: stat.size };
}
