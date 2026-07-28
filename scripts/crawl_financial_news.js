const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * 財經新聞爬蟲與熱門概念題材即時擷取腳本
 * 來源：經濟日報 (EDN)、雅虎股市 RSS/新聞 API
 */

const HOT_THEME_KEYWORDS = [
  'CoWoS', '矽光子', 'CPO', 'AI伺服器', '液冷散熱', '人形機器人', '面板級封裝',
  'B200', 'GB200', '玻璃基板', '重電', '綠能', '低軌衛星', 'ASIC', '車用晶片',
  'ABF載板', '半導體設備', '摺疊機樞紐', '高股息', '台積電概念股'
];

async function crawlFinancialNews() {
  console.log('[News Crawler] Starting financial news update...');
  const newsList = [];

  try {
    // 1. Fetch Yahoo Finance Taiwan news RSS feed
    const yfRssUrl = 'https://tw.stock.yahoo.com/rss?category=news';
    const response = await axios.get(yfRssUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = response.data || '';

    // Simple RSS item regex extraction
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const link = match[2].trim();
      if (title) {
        newsList.push({ title, link, source: 'Yahoo Finance' });
      }
    }
  } catch (err) {
    console.warn('[News Crawler] Yahoo Finance RSS fetch failed or fallback:', err.message);
  }

  // Count keyword frequencies in current news titles
  const themeMentions = {};
  for (const keyword of HOT_THEME_KEYWORDS) {
    themeMentions[keyword] = 0;
    for (const item of newsList) {
      if (item.title.includes(keyword)) {
        themeMentions[keyword]++;
      }
    }
  }

  const result = {
    updated_at: new Date().toISOString(),
    total_news_crawled: newsList.length,
    trending_keywords: themeMentions,
    latest_headlines: newsList.slice(0, 15)
  };

  const outputPath = path.join(__dirname, '..', 'stock_dictionary', 'latest_news_trends.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[News Crawler] Crawled ${newsList.length} headlines. Saved trends to ${outputPath}`);
  return result;
}

if (require.main === module) {
  crawlFinancialNews();
}

module.exports = { crawlFinancialNews };
