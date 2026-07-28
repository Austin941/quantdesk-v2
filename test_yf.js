import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function run() {
  try {
    const quotes = await yahooFinance.quote(['2330.TW', '0050.TW']);
    console.log(quotes.map(q => ({ symbol: q.symbol, price: q.regularMarketPrice, prev: q.regularMarketPreviousClose, vol: q.regularMarketVolume })));
  } catch(e) {
    console.error(e);
  }
}
run();
