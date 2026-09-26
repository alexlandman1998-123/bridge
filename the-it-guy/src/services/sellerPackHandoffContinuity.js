const value = (input) => String(input || '').trim()

const fileIdentity = (row = {}) => ({
  path: value(row.storagePath || row.storage_path || row.filePath || row.file_path),
  url: value(row.url || row.fileUrl || row.file_url || row.downloadUrl || row.download_url),
})

export function getMissingSellerPackListingDocuments(packRows = [], listingDocuments = []) {
  const listingFiles = (Array.isArray(listingDocuments) ? listingDocuments : []).map(fileIdentity)
  return (Array.isArray(packRows) ? packRows : []).filter((row) => {
    const source = fileIdentity(row)
    if (!source.path && !source.url) return false
    return !listingFiles.some((file) =>
      (source.path && file.path === source.path) ||
      (source.url && file.url === source.url))
  })
}
