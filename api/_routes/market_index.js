export default async function handler(req, res) {
  // Allow CORS & Edge Cache for 15 seconds to prevent rate limits but keep it live
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?interval=1d&range=1d`;
    const response = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned status ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result[0];
    const meta = result.meta;

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    let dailyReturn = 0;

    if (prevClose > 0 && price > 0) {
      dailyReturn = ((price - prevClose) / prevClose) * 100;
    }

    res.status(200).json({
      success: true,
      data: {
        price,
        prevClose,
        dailyReturn,
        volume: meta.regularMarketVolume || 0
      }
    });

  } catch (error) {
    console.error('Market Index API Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market index data',
      details: error.message
    });
  }
}
