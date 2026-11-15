import ListingForm from '../components/ListingForm'

export default function Sell() {
  return (
    <div className="max-w-6xl mx-auto px-6 pb-16">
      <header className="pt-16 pb-12">
        <h1 className="text-5xl md:text-7xl leading-tight">Give Your Clothes <em className="text-rose">a New Story.</em></h1>
        <p className="mt-5 max-w-lg text-charcoal/75">List your pre-loved pieces and help someone discover their next favourite outfit.</p>
      </header>
      <ListingForm mode="sell" />
    </div>
  )
}
