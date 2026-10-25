export default function Home() {
  return <main>
    <p className="eyebrow">TREAT OR CODE · HALLOWEEN CHALLENGE</p>
    <h1>Trick your brain.<br />Treat yourself.</h1>
    <p>Enter the number on your paper. Solve the challenge. Claim your candy.</p>
    <form action="/challenge" method="get">
      <label htmlFor="number">Your slip number</label>
      <div className="picker"><input id="number" name="number" type="number" min="1" max="100" required /><button>Open challenge</button></div>
    </form>
    <p className="note">Your challenge board will appear here once the challenges are ready.</p>
  </main>;
}
