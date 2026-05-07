import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-screen-bg">
      <nav className="bg-white border-b border-border flex items-center justify-between px-6 h-14">
        <span className="font-serif text-xl text-ink">Folio</span>
        <div className="flex gap-2">
          <Link href="/login"><Button variant="outline" size="sm">Log in</Button></Link>
          <Link href="/signup"><Button size="sm">Get started</Button></Link>
        </div>
      </nav>

      <div className="bg-ink text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.03) 60px, rgba(255,255,255,0.03) 61px)' }} />
        <div className="relative text-center px-6 py-16">
          <p className="font-mono text-[11px] tracking-[0.15em] uppercase text-[#9abaad] mb-4">For Australian property investors</p>
          <h1 className="font-serif text-4xl md:text-5xl leading-tight mb-4">
            Your portfolio,<br /><em className="text-[#9abaad]">clearly summarised</em>
          </h1>
          <p className="text-[#aaa] text-sm md:text-base max-w-sm mx-auto mb-8 leading-relaxed">
            Upload your PM statements. Get a clean monthly report — no spreadsheets, no guesswork.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/signup"><Button size="lg" className="bg-white text-ink hover:bg-paper">Get started free</Button></Link>
            <Link href="/dashboard"><Button size="lg" variant="outline" className="border-white/20 text-white bg-transparent hover:bg-white/10">View demo →</Button></Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-border">
        {[
          { icon: '📄', title: 'Upload PDFs',       desc: 'Drop your PM statements. We extract the numbers automatically.' },
          { icon: '🧮', title: 'Monthly summary',   desc: 'Rent, expenses, mortgage, and net cash flow — all in one view.' },
          { icon: '🔍', title: 'Transparent flags', desc: 'Missing data is always called out. No silent assumptions.' },
        ].map((f, i) => (
          <div key={i} className="bg-white p-6 border-r border-border last:border-r-0">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-muted leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-10 py-6 bg-white">
        {[{ num: '2–10', label: 'properties supported' }, { num: 'AU', label: 'focused' }, { num: '100%', label: 'transparent' }].map((s, i) => (
          <div key={i} className="text-center">
            <span className="font-serif text-2xl text-ink block">{s.num}</span>
            <span className="text-xs text-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
