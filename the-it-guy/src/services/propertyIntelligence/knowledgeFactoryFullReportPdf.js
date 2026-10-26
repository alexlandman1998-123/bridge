import { jsPDF } from 'jspdf';
import { verifiedBoundaryGeometry } from './knowledgeFactoryBoundary.js';
import { reportMoney, suppliedNumber, financeIndicator, transferScope } from './knowledgeFactoryReportDisplay.js';

const COLOR = { ink: '#102D47', muted: '#697D90', green: '#11895A', soft: '#E7F6EF', line: '#D8E1E6' };
const LEFT = 18, RIGHT = 192, BOTTOM = 272;
const present = value => value !== null && value !== undefined && String(value).trim() !== '';
const valueText = value => present(value) ? String(value) : 'Not supplied';
const yesNo = value => value === true ? 'Yes' : value === false ? 'No' : 'Not supplied';
const list = value => Array.isArray(value) ? value : [];
// Use fixed separators supported by the embedded PDF fonts across browsers.
const money = value => reportMoney(value).replace(/\u00a0|\u202f/g, ' ');
const date = value => {
  if (!present(value)) return 'Not supplied';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium', timeZone: 'Africa/Johannesburg',
  }).format(parsed);
};

/** Render only the authorised saved snapshot; no map, font or supplier network requests. */
export function buildFullPropertyReportPdf(report = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const data = report.report_data || {};
  const property = data.property || {};
  const definition = report.report_definition_snapshot || {};
  const signals = report.opportunity_signals || {};
  const finance = data.finance || {};
  const valuation = data.municipalValuation || {};
  const transactions = list(data.transactions);
  let y = 40;
  let sectionNumber = 0;
  let currentSection = '';
  const put = (value, x, at, size = 9, color = COLOR.ink, bold = false, align) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(value), x, at, align ? { align } : undefined);
  };
  const split = (value, width, size = 9) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(valueText(value), width);
  };
  const header = () => {
    doc.setDrawColor(COLOR.ink);
    doc.setLineWidth(.8);
    doc.path([{ op: 'm', c: [20, 16] }, { op: 'c', c: [24, 6, 35, 6, 39, 16] }]);
    doc.stroke();
    doc.setFillColor(COLOR.green);
    doc.circle(39, 16, .85, 'F');
    put('Arch', 18, 24, 19, COLOR.ink, true);
    put('9', 33.7, 24, 19, COLOR.green, true);
    put('PROPERTY INTELLIGENCE', RIGHT, 18, 7.5, COLOR.ink, false, 'right');
    doc.setDrawColor(COLOR.line);
    doc.setLineWidth(.2);
    doc.line(LEFT, 31, RIGHT, 31);
    y = 40;
  };
  const nextPage = (continuation = true) => {
    doc.addPage();
    header();
    if (continuation && currentSection) {
      put(`${currentSection} / continued`, LEFT, y, 10, COLOR.ink, true);
      y += 10;
    }
  };
  const room = height => { if (y + height > BOTTOM) nextPage(); };
  const paragraph = (value, size = 8, color = COLOR.muted) => {
    for (const line of split(value, RIGHT - LEFT, size)) {
      room(4.5);
      put(line, LEFT, y, size, color);
      y += 4.5;
    }
    y += 2;
  };
  const section = title => {
    // Keep a section heading with at least two rows of its content.
    if (y + 24 > BOTTOM) nextPage(false);
    y += 4;
    sectionNumber += 1;
    currentSection = title;
    put(String(sectionNumber).padStart(2, '0'), LEFT, y, 9, COLOR.green);
    put(title, 29, y, 11, COLOR.ink, true);
    y += 10;
  };
  const row = (label, value) => {
    const labels = split(label, 60, 8.5);
    const values = split(value, 95, 9);
    const count = Math.max(labels.length, values.length);
    // Small rows stay together; unusually long values split safely across pages.
    if (count * 4.6 + 2 <= 55) room(count * 4.6 + 2);
    for (let i = 0; i < count; i += 1) {
      room(4.6);
      if (labels[i]) put(labels[i], 29, y, 8.5, COLOR.muted);
      if (values[i]) put(values[i], 97, y, 9);
      y += 4.6;
    }
    y += 2;
  };
  const record = title => {
    room(22);
    put(title, 29, y, 10, COLOR.ink, true);
    y += 7;
  };
  const groupPage = title => {
    currentSection = '';
    nextPage(false);
    put(title, LEFT, y, 22);
    y += 13;
  };

  header();
  const title = property.address || `Property ${valueText(property.propertyId ?? report.property_id)}`;
  for (const line of split(title, RIGHT - LEFT, 23)) {
    room(10);
    put(line, LEFT, y, 23);
    y += 10;
  }
  paragraph([property.suburb, property.town, property.province].filter(present).join(' / ') || 'Location not supplied', 10);
  paragraph(definition.name || 'Full property report', 9, COLOR.green);
  row('Report reference', report.id);
  row('Retrieved', date(report.executed_at));
  row('Requested purpose', report.request_context_snapshot?.requestPurpose);
  room(23);
  y += 3;
  const tenure = suppliedNumber(signals.ownershipTenureYears) ? `${signals.ownershipTenureYears} years` : 'Not supplied';
  const latestPurchase = transactions[0]?.purchaseAmount;
  for (const [x, metric, label] of [[18, tenure, 'OWNERSHIP TENURE'], [79, money(latestPurchase), 'NEWEST RETURNED PURCHASE'], [140, money(valuation.value), 'MUNICIPAL VALUATION']]) {
    const lines = split(metric, 52, 15);
    lines.forEach((line, i) => put(line, x, y + i * 5, 15));
    put(label, x, y + 12, 6.5, COLOR.muted);
  }
  y += 23;

  section('Property identity');
  for (const [label, value] of [
    ['Property ID', property.propertyId ?? report.property_id], ['Address', property.address],
    ['Suburb / town', [property.suburb, property.town].filter(present).join(' / ')],
    ['Province / postal code', [property.province, property.postalCode].filter(present).join(' / ')],
    ['Property type / name', `${valueText(property.type)} / ${valueText(property.name)}`], ['Property number / year', `${valueText(property.number)} / ${valueText(property.year)}`],
    ['Deeds office ID', property.deedsOfficeId], ['Erf / portion / unit', `${valueText(property.erf)} / ${valueText(property.portion)} / ${valueText(property.unit)}`],
    ['Scheme ID / parent farm', `${valueText(property.schemeId)} / ${valueText(property.parentFarm)}`],
    ['Extent', present(property.extent) ? `${property.extent} (supplier units unconfirmed)` : null],
    ['Cadastral / deeds records present', `${yesNo(property.hasCad)} / ${yesNo(property.hasDeeds)}`],
    ['Address / transfer records present', `${yesNo(property.hasNad)} / ${yesNo(property.hasTransfer)}`],
  ]) row(label, value);


  section('Current ownership');
  if (!list(data.owners).length) paragraph('No current owner record was supplied in this report snapshot.');
  list(data.owners).forEach((owner, index) => {
    row(`Owner ${index + 1} / type / share`, `${valueText(owner?.name)} / ${valueText(owner?.type)} / ${valueText(owner?.share)}`);
  });
  row('Ownership / tenure registration', `${date(data.ownership?.registeredAt)} / ${date(signals.ownershipRegisteredAt)}`);
  row('Approximate ownership tenure', tenure);

  groupPage('Transfers & finance');
  section('Selected transfer timeline');
  paragraph(transferScope(data));
  row('Transfer query limit / order', `${valueText(data.transferHistory?.limit)} / ${valueText(data.transferHistory?.order)}`);
  if (!transactions.length) paragraph('No transfer timeline was supplied in this report snapshot.');
  transactions.forEach((transaction, index) => {
    record(`Transfer ${index + 1}`);
    row('Purchased / registered', `${date(transaction?.purchasedAt)} / ${date(transaction?.registeredAt)}`);
    row('Purchase amount / reference', `${money(transaction?.purchaseAmount)} / ${valueText(transaction?.purchaseReference)}`);
    row('Extent / current ownership', `${valueText(transaction?.extent)} (supplier units) / ${yesNo(transaction?.isCurrentOwner)}`);
  });

  section('Current bond information');
  row('Current finance indicator', financeIndicator(finance.hasCurrentBond));
  row('Current bonds in returned records', finance.currentBondCount);
  row('Bond query limit', finance.bondRecordLimit);
  row('Further bond records exist', yesNo(finance.hasMoreBondRecords));
  if (finance.hasMoreBondRecords === true) paragraph('Further bond records exist. The returned count is not the total bond count.');
  if (!list(finance.currentBonds).length) paragraph('No individual current-bond records were supplied. This does not establish that no bond exists.');
  list(finance.currentBonds).forEach((bond, index) => {
    record(`Finance record ${index + 1}`);
    row('Registered / indicator', `${date(bond?.registeredAt)} / ${valueText(bond?.indicator)}`);
  });

  const boundary = data.boundary;
  const geometry = boundary?.status === 'supplied'
    && String(boundary.propertyId) === String(property.propertyId ?? report.property_id)
    && boundary.supplierEnvironment === report.request_context_snapshot?.supplierEnvironment
    ? verifiedBoundaryGeometry(boundary.geometry) : null;
  if (geometry) {
    if (y + 73 > BOTTOM) nextPage(false);
    section('Property outline');
    const top=y, height=40, points=geometry.coordinates.flat(2);
    const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const factor=Math.max(.01,Math.cos((minY+maxY)/2*Math.PI/180));
    const width=(maxX-minX)*factor, extent=maxY-minY;
    const scale=Math.min(125/width,32/extent);
    const project=p=>[LEFT+79+(p[0]-(minX+maxX)/2)*factor*scale,top+20-(p[1]-(minY+maxY)/2)*scale];
    doc.setFillColor('#F6FAF8');doc.setDrawColor(COLOR.line);doc.roundedRect(LEFT,top,RIGHT-LEFT,height,2,2,'FD');
    const paths=[];
    for (const polygon of geometry.coordinates) for (const ring of polygon) {
      ring.forEach((point,index)=>paths.push({op:index?'l':'m',c:project(point)}));paths.push({op:'h',c:[]});
    }
    doc.setFillColor('#D5EFE2');doc.setDrawColor(COLOR.green);doc.setLineWidth(.5);
    doc.path(paths);doc.fillStrokeEvenOdd();
    put('N',RIGHT-8,top+8,7,COLOR.ink,true,'center');
    doc.line(RIGHT-8,top+12,RIGHT-8,top+23);doc.line(RIGHT-8,top+12,RIGHT-10,top+16);doc.line(RIGHT-8,top+12,RIGHT-6,top+16);
    y=top+height+6;
    paragraph(`Supplier boundary / ${date(boundary.retrievedAt)} / ${boundary.supplierEnvironment}. Outline diagram; no background map. Not a surveyed boundary.`,7);
  } else {
    paragraph('Boundary geometry is not included in this saved report snapshot. No property outline or background map has been inferred.');
    if (boundary?.reason) paragraph(boundary.reason,7);
  }

  groupPage('Valuation & report coverage');
  section('Municipal valuation and zoning');
  row('Municipal valuation', money(valuation.value));
  row('Valuation date', date(valuation.date));
  row('Municipality', valuation.municipality);
  row('Zoning', valuation.zoning);
  row('Valuation reason', valuation.reason);
  paragraph('A municipal valuation and a historical purchase price measure different things at different dates. Neither is presented as a current market valuation.');

  section('Property context');
  row('Transfer records reviewed', signals.transferRecordsReviewed);
  row('Newest registration in returned records', date(signals.latestTransferRegisteredAt));
  row('Current finance indicator', financeIndicator(signals.currentFinanceRecorded));
  const comparison = signals.municipalValuationVsLatestPurchase;
  row('Valuation vs newest returned purchase', comparison ? `${money(comparison.difference)} (${valueText(comparison.percentageDifference)}% difference)` : 'Insufficient data to compare');
  if (suppliedNumber(latestPurchase) && Number(latestPurchase) > 0 && suppliedNumber(valuation.value) && Number(valuation.value) > 0) {
    room(24);
    const maximum = Math.max(Number(latestPurchase), Number(valuation.value));
    for (const [label, amount, color] of [['Latest purchase', latestPurchase, COLOR.ink], ['Municipal valuation', valuation.value, COLOR.green]]) {
      put(label, 29, y, 8, COLOR.muted);
      doc.setFillColor(COLOR.line); doc.rect(75, y - 3, 65, 3, 'F');
      doc.setFillColor(color); doc.rect(75, y - 3, 65 * Number(amount) / maximum, 3, 'F');
      put(money(amount), RIGHT, y, 8, COLOR.ink, false, 'right');
      y += 8;
    }
    y += 3;
  }

  section('Scope and provenance');
  row('Source', 'Knowledge Factory / saved property report');
  row('Snapshot version', report.report_snapshot_version);
  row('Definition version', definition.definitionVersion);
  row('Cost-validation recipe', definition.costValidationRecipeId);
  if (present(definition.description)) row('Report description', definition.description);
  if (list(definition.excludedFields).length) row('Deliberately not included', definition.excludedFields.join('; '));
  paragraph('This report was generated from the saved report snapshot. Downloading it does not submit another supplier request or use additional supplier credits.');
  paragraph('Missing fields are shown as Not supplied. Record-availability flags are supplier indicators, not independent verification. This report is not an original title-deed document or a surveyed boundary.');
  paragraph("Use this information only for the stated business purpose and in line with your organisation's legal, privacy and compliance obligations.");

  const pages = doc.getNumberOfPages();
  for (let number = 1; number <= pages; number += 1) {
    doc.setPage(number);
    doc.setDrawColor(COLOR.line);doc.setLineWidth(.2);doc.line(LEFT, 280, RIGHT, 280);
    put('Arch9 Property Intelligence / confidential', LEFT, 286, 7, COLOR.muted);
    put(`${number} / ${pages}`, RIGHT, 286, 7, COLOR.muted, false, 'right');
  }
  doc.setProperties({ title: `${title} - Arch9 property intelligence report`, subject: 'Saved property intelligence report snapshot', author: 'Arch9', creator: 'Arch9' });
  return doc;
}
