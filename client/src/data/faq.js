export const faq = [
  {
    q: "Where does the CSV come from?",
    a: "Apify's Instagram Sort Feed scraper. Export your profile feed as CSV — that's the file you upload. The framework supports the standard Apify export schema (caption, plays, likes, comments, audio URL, timestamps).",
  },
  {
    q: "What happens to my data?",
    a: "The CSV is processed in your browser and on a single backend run. Transcripts and analysis are generated for that session only — nothing is retained, indexed, or used to train any model. Your raw posts are yours.",
  },
  {
    q: "How is this different from a content template?",
    a: "Templates assume what works. This engine refuses to invent any pattern, phrase, or structure that doesn't already exist in your top-performing posts. Every claim in the report has a citation back to one or more of your own reels.",
  },
  {
    q: "Why CSV — not the Instagram API?",
    a: "Meta's Graph API doesn't expose the depth of post-level data the framework needs (full caption, audio source, play counts on non-business accounts, hashtag breakdowns). The Sort Feed export gives you everything in one shot.",
  },
  {
    q: "Can I run it on a competitor's profile?",
    a: "Yes. The engine only needs the CSV — it doesn't care whose feed it analyzes. Useful for benchmarking voice and structure differences against creators in your tier.",
  },
  {
    q: "How long does an analysis take?",
    a: "Fast mode: about 40 seconds. Deep mode (full six-layer breakdown + three script blueprints): one to three minutes. Audio transcription of your top 5 reels adds 10–20 seconds when needed.",
  },
  {
    q: "Do I own the report?",
    a: "Yes. The report is generated for you, on your data, and is yours to use however you want. Export to Markdown, PDF, or CSV from inside the tool.",
  },
  {
    q: "Who is this not for?",
    a: "Accounts with fewer than ~30 reels of meaningful engagement data. The engine looks for patterns across at least the top decile of posts — below ~30 reels there's not enough signal to surface a defensible framework.",
  },
];
