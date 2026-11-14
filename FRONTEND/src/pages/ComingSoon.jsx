import { Link } from 'react-router-dom'
import Button from '../components/Button'

export default function ComingSoon({ name, phase }) {
  return (
    <section className="max-w-3xl mx-auto px-6 py-32 text-center">
      <h1 className="text-5xl mb-4">{name}</h1>
      <p className="text-charcoal/70 mb-8">
        {phase ? `This page is planned for Phase ${phase} of the build.` : "We couldn't find that page."}
      </p>
      <Link to="/"><Button>Back to home</Button></Link>
    </section>
  )
}
