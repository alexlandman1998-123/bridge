import SellerFicaVerification from './SellerFicaVerification'

export default function BuyerFicaVerification(props) {
  return <SellerFicaVerification {...props} partyType="buyer" clientName={props.buyerName} />
}
