export default function Home() {
  return <main className="home-page" id="main-content">
    <header className="home-header"><span className="brand"><span className="brand-mark" aria-hidden="true">{'{ }'}</span> Treat or Code</span><span>Halloween challenge</span></header>
    <div className="home-content">
      <h1>Trick your brain.<br /><span>Treat yourself.</span></h1>
      <p>Enter the number on your paper. Solve the challenge. Claim your candy.</p>
      <form action="/challenge" method="get">
        <label htmlFor="number">Your slip number</label>
        <div className="picker"><input id="number" name="number" type="number" min="1" max="100" required placeholder="1–100" inputMode="numeric" /><button>Open challenge</button></div>
      </form>
      <p className="note">Your challenge board will appear here once the challenges are ready.</p>
    </div>
  </main>;
}
