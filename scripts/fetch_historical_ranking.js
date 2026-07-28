import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import { getConglomeratesByStockCode } from './conglomerates_database.js';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('Starting historical ranking pre-calculation...');
  
  // 1. Load CSV
  const csvPath = path.join(__dirname, '..', 'public', 'stocks.csv');
  const csvData = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvData.split('\n').slice(1);
  
  const allStocks = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (!cols[0] || !cols[1]) continue;
    allStocks.push({
      '股票代號': cols[0].trim(),
      '股票名稱': cols[1].trim(),
      '產業別': cols[2] ? cols[2].trim() : '',
      '市場別': cols[3] ? cols[3].trim() : '',
      '題材清單': cols[6] ? cols[6].trim() : ''
    });
  }
  
  console.log(`Loaded ${allStocks.length} stocks from CSV.`);
  
  const period1Date = new Date();
  period1Date.setDate(period1Date.getDate() - 40); // 40 days back to get 20 trading days safely
  const period1 = period1Date.toISOString().split('T')[0];
  
  const results = {};
  const CHUNK_SIZE = 20;
  
  // 2. Fetch Historical Data
  for (let i = 0; i < allStocks.length; i += CHUNK_SIZE) {
    const chunk = allStocks.slice(i, i + CHUNK_SIZE);
    const promises = chunk.map(async (stock) => {
      try {
        const market = stock['市場別'];
        const yfSymbol = (market.includes('上市')) ? `${stock['股票代號']}.TW` : `${stock['股票代號']}.TWO`;
        const chartRes = await yahooFinance.chart(yfSymbol, { period1, interval: '1d' });
        const hist = chartRes ? chartRes.quotes : null;
        
        if (!hist || hist.length === 0) return null;
        
        // Filter out days with null close
        const validHist = hist.filter(d => d.close != null && d.close > 0 && d.volume > 0);
        if (validHist.length < 3) return null;
        
        const calcPeriod = (days) => {
          const recent = validHist.slice(-days);
          if (recent.length < 1) return null;
          
          // Use the previous close (day before the period) as the start reference
          const beforePeriod = validHist[Math.max(0, validHist.length - days - 1)];
          const startClose = beforePeriod ? (beforePeriod.close || beforePeriod.open) : (recent[0].open || recent[0].close);
          const endClose = recent[recent.length - 1].close;
          
          if (!startClose || startClose <= 0 || !endClose || endClose <= 0) return null;
          
          const cumulativeReturn = ((endClose - startClose) / startClose) * 100;
          
          let totalVolume = 0;
          let totalAmount = 0;
          for (const day of recent) {
            const vol = day.volume / 1000; // in thousands (張)
            totalVolume += vol;
            totalAmount += (vol * day.close * 1000); // TWD
          }

          // Prior period of same length for delta (差值) calculation
          const prior = validHist.slice(Math.max(0, validHist.length - days * 2), validHist.length - days);
          let priorVolume = 0;
          let priorAmount = 0;
          for (const day of prior) {
            const vol = day.volume / 1000;
            priorVolume += vol;
            priorAmount += (vol * day.close * 1000);
          }

          if (prior.length > 0 && prior.length < days) {
            const scale = recent.length / prior.length;
            priorVolume *= scale;
            priorAmount *= scale;
          }

          const amountDiff = prior.length > 0 ? (totalAmount - priorAmount) : (totalAmount * (cumulativeReturn / 100));
          const volumeDiff = prior.length > 0 ? (totalVolume - priorVolume) : 0;
          
          return { dailyReturn: cumulativeReturn, volume: totalVolume, amount: totalAmount, volumeDiff, amountDiff };
        };
        
        const p1  = calcPeriod(1);
        const p3  = calcPeriod(3);
        const p5  = calcPeriod(5);
        const p10 = calcPeriod(10);
        const p20 = calcPeriod(20);
        
        if (!p1 && !p3 && !p5 && !p10 && !p20) return null;
        
        return {
          stock,
          '1': p1,
          '3': p3,
          '5': p5,
          '10': p10,
          '20': p20
        };
      } catch (e) {
        // Silent ignore for individual stock failures
        return null;
      }
    });
    
    const chunkResults = await Promise.all(promises);
    for (const res of chunkResults) {
      if (res) results[res.stock['股票代號']] = res;
    }
    
    console.log(`Fetched ${Math.min(i + CHUNK_SIZE, allStocks.length)} / ${allStocks.length}`);
    await new Promise(r => setTimeout(r, 500)); // Anti-rate-limit sleep
  }
  
  console.log(`Successfully fetched data for ${Object.keys(results).length} stocks.`);
  
  // 3. Aggregate Data
  const finalJson = {
    updated_at: new Date().toISOString(),
    '1': { sectors: [], themes: [], groups: [], radar: [] },
    '3': { sectors: [], themes: [], groups: [], radar: [] },
    '5': { sectors: [], themes: [], groups: [], radar: [] },
    '10': { sectors: [], themes: [], groups: [], radar: [] },
    '20': { sectors: [], themes: [], groups: [], radar: [] }
  };
  
  const periods = ['1', '3', '5', '10', '20'];
  const blacklist = ['半導體', '電子零組件', '電子代工', '通信網路', '其他電子', '光電', '電腦及週邊設備'];
  
  for (const days of periods) {
    const sectorMap = {};
    const themeMap = {};
    const groupMap = {};
    const validStocks = [];
    
    for (const symbol in results) {
      const data = results[symbol];
      const pData = data[days];
      if (!pData || pData.amount === 0 || !isFinite(pData.dailyReturn)) continue;
      
      const stock = data.stock;
      
      // Keep for radar
      validStocks.push({
        stock: stock, // The raw stock object, exactly matching frontend expectations
        dailyReturn: pData.dailyReturn,
        volume: pData.volume,
        amount: pData.amount,
        volumeDiff: pData.volumeDiff || 0,
        amountDiff: pData.amountDiff || 0
      });
      
      // Sector
      if (stock['產業別'] && stock['產業別'] !== '無' && stock['產業別'] !== '') {
        if (!sectorMap[stock['產業別']]) {
          sectorMap[stock['產業別']] = {
            sector: stock['產業別'],
            totalVolume: 0,
            totalAmount: 0,
            totalVolumeDiff: 0,
            totalAmountDiff: 0,
            weightedReturnSum: 0,
            count: 0
          };
        }
        sectorMap[stock['產業別']].totalVolume += pData.volume;
        sectorMap[stock['產業別']].totalAmount += pData.amount;
        sectorMap[stock['產業別']].totalVolumeDiff += (pData.volumeDiff || 0);
        sectorMap[stock['產業別']].totalAmountDiff += (pData.amountDiff || 0);
        sectorMap[stock['產業別']].weightedReturnSum += (pData.dailyReturn * pData.amount);
        sectorMap[stock['產業別']].count += 1;
      }
      
      // Theme
      if (stock['題材清單']) {
        const themesArr = stock['題材清單'].split('、').map(t => t.trim())
          .filter(t => t.length > 0 && t !== stock['產業別'] && !blacklist.includes(t));
          
        for (const t of themesArr) {
          if (!themeMap[t]) {
            themeMap[t] = {
              theme: t,
              totalVolume: 0,
              totalAmount: 0,
              totalVolumeDiff: 0,
              totalAmountDiff: 0,
              weightedReturnSum: 0,
              count: 0
            };
          }
          themeMap[t].totalVolume += pData.volume;
          themeMap[t].totalAmount += pData.amount;
          themeMap[t].totalVolumeDiff += (pData.volumeDiff || 0);
          themeMap[t].totalAmountDiff += (pData.amountDiff || 0);
          themeMap[t].weightedReturnSum += (pData.dailyReturn * pData.amount);
          themeMap[t].count += 1;
        }
      }

      // Group (集團股)
      const groupName = getConglomeratesByStockCode(stock['股票代號']);
      if (groupName && groupName !== '獨立/未歸類') {
        if (!groupMap[groupName]) {
          groupMap[groupName] = {
            group: groupName,
            totalVolume: 0,
            totalAmount: 0,
            totalVolumeDiff: 0,
            totalAmountDiff: 0,
            weightedReturnSum: 0,
            count: 0
          };
        }
        groupMap[groupName].totalVolume += pData.volume;
        groupMap[groupName].totalAmount += pData.amount;
        groupMap[groupName].totalVolumeDiff += (pData.volumeDiff || 0);
        groupMap[groupName].totalAmountDiff += (pData.amountDiff || 0);
        groupMap[groupName].weightedReturnSum += (pData.dailyReturn * pData.amount);
        groupMap[groupName].count += 1;
      }
    }
    
    // Convert maps to arrays and calculate avgReturn
    finalJson[days].sectors = Object.values(sectorMap).map(s => {
      s.avgReturn = s.totalAmount > 0 ? s.weightedReturnSum / s.totalAmount : 0;
      delete s.weightedReturnSum;
      return s;
    }).filter(s => isFinite(s.avgReturn));
    
    finalJson[days].themes = Object.values(themeMap).map(t => {
      t.avgReturn = t.totalAmount > 0 ? t.weightedReturnSum / t.totalAmount : 0;
      delete t.weightedReturnSum;
      return t;
    }).filter(t => isFinite(t.avgReturn));

    finalJson[days].groups = Object.values(groupMap).map(g => {
      g.avgReturn = g.totalAmount > 0 ? g.weightedReturnSum / g.totalAmount : 0;
      delete g.weightedReturnSum;
      return g;
    }).filter(g => isFinite(g.avgReturn));
    
    // Sort all stocks by amountDiff descending (or amount)
    validStocks.sort((a, b) => b.amountDiff - a.amountDiff);
    
    // Store all stocks for bubble chart, but radar can just use the same array
    finalJson[days].allStocks = validStocks;
    finalJson[days].radar = validStocks.slice(0, 200); // Keep radar small for fast UI, chart uses allStocks
    
    console.log(`Period ${days}d: ${finalJson[days].sectors.length} sectors, ${finalJson[days].themes.length} themes, ${finalJson[days].allStocks.length} stocks`);
  }
  
  // 4. Validate and Save JSON
  const successRate = Object.keys(results).length / allStocks.length;
  if (successRate < 0.6) {
    console.error(`Fetch failed: Success rate is too low (${(successRate * 100).toFixed(1)}%). Refusing to overwrite JSON.`);
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '..', 'public', 'historical_ranking.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalJson));
  console.log(`Saved historical ranking data to ${outputPath} (Success rate: ${(successRate * 100).toFixed(1)}%)`);
}

run();
