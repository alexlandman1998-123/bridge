import { buildKnowledgeFactoryReportPdf } from '../../src/services/propertyIntelligence/knowledgeFactoryReportPdf.js';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const receiptView = receipt => ({
  status: receipt.status, leadId: receipt.lead_id || null,
  listingId: receipt.private_listing_id || null, documentId: receipt.document_id || null,
});

/** This job consumes an immutable saved report, never another supplier request. */
export async function fileKnowledgeFactorySellerReport({ db, report, actorId, renderPdf = buildKnowledgeFactoryReportPdf }) {
  const prepared = await db.rpc('knowledge_factory_prepare_seller_filing', { p_report_id: report.id, p_actor_id: actorId });
  if (prepared.error) throw new Error('The report is saved, but seller lead filing needs a retry.');
  const receipt = prepared.data;
  if (!receipt?.status) throw new Error('Seller lead filing was not confirmed.');
  if (receipt.status === 'test_report' || receipt.status === 'filed') return receiptView(receipt);

  const expected = `private-listings/${receipt.private_listing_id}/knowledge-factory/${report.id}.pdf`;
  if (receipt.storage_path !== expected) throw new Error('The report document location could not be verified.');
  const bucket = await db.storage.getBucket('documents');
  if (bucket.error || !bucket.data || bucket.data.public !== false) throw new Error('Private document storage is unavailable. The report is saved; retry filing later.');
  const storage = db.storage.from('documents');
  const document = renderPdf(report);
  // Stable metadata makes upload recovery verify this report's exact PDF,
  // rather than trusting any file placed at the same storage path.
  document.setFileId?.(digest(report.id).slice(0, 32));
  const retrievedAt = new Date(report.executed_at || 0);
  document.setCreationDate?.(Number.isNaN(retrievedAt.getTime()) ? new Date(0) : retrievedAt);
  const pdf = new Uint8Array(document.output('arraybuffer'));
  const upload = await storage.upload(expected, pdf, { contentType: 'application/pdf', upsert: false });
  if (upload.error) {
    // A timeout can mean the first upload completed. Reuse that immutable object,
    // but verify its type/signature before allowing the database to attach it.
    const existing = await storage.download(expected);
    if (existing.error || !existing.data || existing.data.type !== 'application/pdf') throw new Error('The report is saved, but its PDF could not be filed. Retry filing; do not buy the report again.');
    const saved = new Uint8Array(await existing.data.arrayBuffer());
    if (digest(saved) !== digest(pdf)) throw new Error('The existing report file does not match this saved report. Administrator review is required.');
  }
  const completed = await db.rpc('knowledge_factory_complete_seller_filing', { p_report_id: report.id, p_actor_id: actorId });
  if (completed.error || completed.data?.status !== 'filed') throw new Error('The report and PDF are saved, but the seller document link needs a retry.');
  return receiptView(completed.data);
}

// A filing failure must never turn a successfully charged report into a failed
// purchase or permit another supplier request. Completed Reports offers retry.
export async function attemptKnowledgeFactorySellerFiling(args) {
  try { return await fileKnowledgeFactorySellerReport(args); }
  catch { return { status: 'pending', message: 'Report saved. Seller lead or document filing needs a retry from Completed reports.' }; }
}
