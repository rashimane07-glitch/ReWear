import { Link } from 'react-router-dom'
import Button from '../components/Button'

const values = [
  ['Reuse first', 'A piece that is worn again is a piece that is not thrown away. We make passing clothes on as easy as buying new.'],
  ['Built for campus', 'ReWear is made for students: affordable prices, swaps instead of spending, and people close enough to meet.'],
  ['Simple and safe', 'No payments on the platform. Owners accept or reject every request, and contact details are shared only after acceptance.'],
]

export default function About() {
  return (
    <>
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16">
        <p className="text-xs tracking-[0.2em] text-rose mb-3">ABOUT REWEAR</p>
        <h1 className="text-5xl md:text-7xl leading-tight">Fashion that <em className="text-rose">keeps going.</em></h1>
        <p className="mt-8 text-lg text-charcoal/80 max-w-2xl leading-relaxed">
          ReWear is a student marketplace for pre-loved clothing. Sell what you have outgrown, swap for something new to you, or donate to someone who will wear it.
          Your Style, Their Second Chance.
        </p>
      </section>
      <section className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 border-t border-plum/20">
        {values.map(([t, d]) => (
          <div key={t} className="py-10 md:pr-8 md:border-r border-plum/20 last:border-r-0">
            <h2 className="text-2xl">{t}</h2><p className="text-sm text-charcoal/70 mt-3 leading-relaxed">{d}</p>
          </div>
        ))}
      </section>
      <section className="bg-blush mt-16 py-16 px-6 text-center">
        <h2 className="text-3xl md:text-4xl">Questions? Say hello.</h2>
        <p className="mt-3 text-charcoal/80"><a href="mailto:hello@rewear.example" className="underline text-plum">hello@rewear.example</a></p>
        <Link to="/explore" className="inline-block mt-6"><Button>Explore the collection</Button></Link>
      </section>
    </>
  )
}
