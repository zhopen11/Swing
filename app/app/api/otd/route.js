export async function GET() {
  try {
    const res = await fetch('https://on-this-day.com/cgi-bin/otd/sportsotd.pl', {
      next: { revalidate: 3600 },
    });
    const html = await res.text();

    // Events use pattern: <b>YEAR</b> - description
    const events = [];
    const regex = /<b>(\d{4})<\/b>\s*-\s*(.*?)(?=<br|<!|$)/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = match[2].replace(/<[^>]*>/g, '').trim();
      if (text.length > 10) events.push(`${match[1]} - ${text}`);
    }

    if (events.length === 0) {
      return Response.json({ event: null });
    }

    const random = events[Math.floor(Math.random() * events.length)];
    return Response.json({ event: random });
  } catch (err) {
    console.error('OTD fetch failed:', err);
    return Response.json({ event: null });
  }
}
