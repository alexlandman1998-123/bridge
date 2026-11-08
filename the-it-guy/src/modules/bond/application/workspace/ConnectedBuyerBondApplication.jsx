import BuyerBondTracker from '../../../../components/bond/BuyerBondTracker.jsx'

// Each secure link owns a fresh tracker. No data or uploads from a previous
// link can carry into another buyer's file.
export default function ConnectedBuyerBondApplication(props) {
  return <BuyerBondTracker key={`${props.token || ''}:${props.accessToken || ''}`} {...props} />
}
