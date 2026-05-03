const PRODUCT_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#layers", label: "Six layers" },
  { href: "#sample", label: "Sample report" },
  { href: "#analyze", label: "Run framework" },
  { href: "#faq", label: "FAQ" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gold-500/15 bg-navy-950/60">
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gold-500 text-navy-950 font-serif font-bold text-xl grid place-items-center">
              S
            </div>
            <div className="font-serif text-lg gold-text leading-none">SWH</div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Content intelligence built from your own data history — never a template.
          </p>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-500 mb-3 font-semibold">
            Product
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="hover:text-gold-400 transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-500 mb-3 font-semibold">
            Company
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Scaling With High Ticket</li>
            <li className="text-slate-400">Dubai, UAE</li>
            <li>
              <a
                href="mailto:hello@scalingwithhighticket.com"
                className="hover:text-gold-400 transition-colors"
              >
                hello@scalingwithhighticket.com
              </a>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-gold-500 mb-3 font-semibold">
            Legal
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <a href="#" className="hover:text-gold-400 transition-colors">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-gold-400 transition-colors">
                Terms
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-gold-400 transition-colors">
                Data handling
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gold-500/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 tracking-wider uppercase">
          <span>SWH Content Intelligence Engine</span>
          <span>© {year} Scaling With High Ticket</span>
        </div>
      </div>
    </footer>
  );
}
