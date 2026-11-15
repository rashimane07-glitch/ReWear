import ListingForm from '../components/ListingForm'
import ImageWithFallback from '../components/ImageWithFallback'

const steps = ['List your piece', 'Students send requests', 'Arrange a hand-off']
const benefits = [['Less landfill', 'Clothes that get worn again stay out of the bin.'], ['Real help', 'Your pieces go straight to a student who wants them.'], ['A lighter closet', 'Clear space without throwing anything away.']]

export default function Donate() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-16 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-5xl md:text-7xl leading-tight">Give more. <em className="text-rose">Waste less.</em></h1>
          <p className="mt-5 max-w-md text-charcoal/75">Pass on clothes you no longer wear and give them a second life.</p>
        </div>
        <ImageWithFallback src="/images/donate.jpg" alt="Rack of pre-loved clothes" className="w-full aspect-[4/3]" />
      </section>

      <div className="bg-plum text-cream">
        <ol className="max-w-6xl mx-auto px-6 py-6 grid sm:grid-cols-3 gap-4">
          {steps.map((s, i) => <li key={s} className="font-display text-lg"><em className="text-blush mr-2">0{i + 1}</em>{s}</li>)}
        </ol>
      </div>

      <section className="max-w-6xl mx-auto px-6 pt-16 grid sm:grid-cols-3 gap-8">
        {benefits.map(([t, d]) => <div key={t}><h3 className="text-xl">{t}</h3><p className="text-sm text-charcoal/70 mt-2">{d}</p></div>)}
      </section>

      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <ListingForm mode="donate" />
      </div>
    </>
  )
}
