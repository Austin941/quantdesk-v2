const urls = [
  'https://quantdesk-v2.vercel.app/api/closing',
  'https://quantdesk-v2.vercel.app/api/proxy?symbols=tse_2330.tw',
  'https://quantdesk-v2.vercel.app/api/tdcc_history?symbol=2330',
  'https://quantdesk-v2.vercel.app/api/kline?symbol=2330',
  'https://quantdesk-v2.vercel.app/api/drawer_data?symbol=2330'
];

async function check() {
  console.log('Testing APIs...');
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`[${res.status}] ${url.split('/').pop()} -> ${text.substring(0, 80).replace(/\n/g, '')}...`);
    } catch (e) {
      console.log(`[ERROR] ${url} -> ${e.message}`);
    }
  }
}
check();
