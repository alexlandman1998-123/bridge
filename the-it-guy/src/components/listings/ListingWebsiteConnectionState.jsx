import { Globe2, Loader2, RefreshCw } from 'lucide-react'

export default function ListingWebsiteConnectionState({ name, loading, error, detail, onRetry }) {
  return <div className="listing-channel-columns border-t border-[#edf2f7]">
    <div className="flex items-center gap-3"><Globe2 size={21} /><p className="text-sm font-semibold">{name}</p></div>
    <p className="text-sm text-[#607387]">No public listing link available</p>
    <div><p className="text-sm font-semibold">{loading ? 'Checking connection…' : error ? 'Status unavailable' : 'Not connected'}</p><p role={error ? 'alert' : undefined} className="mt-1 text-xs text-[#607387]">{error || detail}</p></div>
    <p className="text-xs text-[#607387]">Publication status has not been confirmed.</p>
    <button type="button" onClick={onRetry} disabled={loading} className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f4f78]">{loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Retry {name} status</button>
  </div>
}
