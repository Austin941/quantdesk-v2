import fs from 'fs';
import path from 'path';

/**
 * GET /api/supply_chain?symbol=2330
 * 回傳指定股票在上中下游產業鏈 (Upstream / Midstream / Downstream) 的位置、供應商、客戶與同集團關聯股
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');

  const { symbol = '2330' } = req.query;
  const cleanSymbol = symbol.replace('.TW', '').replace('.TWO', '').replace('TWSE:', '').replace('OTC:', '').trim();

  try {
    // 1. 讀取本地字典檔案 (group_taxonomy & taiwan_stocks)
    const dictPath = path.join(process.cwd(), 'stock_dictionary', 'taiwan_stocks.json');
    const groupPath = path.join(process.cwd(), 'stock_dictionary', 'group_taxonomy.json');

    let stocksData = [];
    let groupData = {};

    if (fs.existsSync(dictPath)) {
      stocksData = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    }
    if (fs.existsSync(groupPath)) {
      groupData = JSON.parse(fs.readFileSync(groupPath, 'utf-8'));
    }

    const currentStock = stocksData.find(s => s.code === cleanSymbol) || {
      code: cleanSymbol,
      name: cleanSymbol === '2330' ? '台積電' : cleanSymbol === '2454' ? '聯發科' : cleanSymbol === '2317' ? '鴻海' : '台股企業',
      sector: '半導體業/電子業',
      group: '台積電大聯盟',
      themes: ['晶圓代工', '先進封裝 CoWoS', 'AI 晶片']
    };

    // 2. 建構上中下游 (Upstream, Midstream, Downstream) 產業鏈對照表
    const supplyChainDatabase = {
      // 半導體產業鏈 (Semiconductor Value Chain)
      '半導體': {
        chainName: '半導體與先進封裝產業鏈',
        upstream: {
          tier: '上游 (Upstream)',
          description: '矽晶圓、IP 矽智財、IC 設計工具與半導體設備原料',
          companies: [
            { code: '3035', name: '智原', role: 'IP 矽智財' },
            { code: '3443', name: '創意', role: 'IP/ASIC 設計' },
            { code: '3661', name: '世芯-KY', role: 'AI ASIC 設計' },
            { code: '3532', name: '台勝科', role: '矽晶圓' },
            { code: '6488', name: '環球晶', role: '矽晶圓材料' },
            { code: '3131', name: '弘塑', role: 'CoWoS 濕製程設備' },
            { code: '3583', name: '辛耘', role: 'CoWoS 設備與再生晶圓' }
          ]
        },
        midstream: {
          tier: '中游 (Midstream)',
          description: '晶圓代工 (Foundry) 與晶圓製造',
          companies: [
            { code: '2330', name: '台積電', role: '全球晶圓代工龍頭' },
            { code: '2303', name: '聯電', role: '成熟製程代工' },
            { code: '5347', name: '世界', role: '8吋/12吋晶圓代工' },
            { code: '6770', name: '力積電', role: '記憶體與代工' }
          ]
        },
        downstream: {
          tier: '下游 (Downstream)',
          description: '封裝測試 (OSAT)、IC 通路與終端應用',
          companies: [
            { code: '3711', name: '日月光投控', role: '全球封測龍頭' },
            { code: '2449', name: '京元電子', role: 'AI 晶片測試' },
            { code: '6239', name: '力成', role: '記憶體與先進封測' },
            { code: '3278', name: '九齊', role: 'IC 通路' }
          ]
        }
      },
      // AI 伺服器與電子代工產業鏈 (AI Server Value Chain)
      '伺服器': {
        chainName: 'AI 伺服器與組裝供應鏈',
        upstream: {
          tier: '上游 (Upstream)',
          description: 'CCL 高階銅箔基板、PCB 板、導軌與水冷散熱模組',
          companies: [
            { code: '2383', name: '台光電', role: 'AI 伺服器 CCL' },
            { code: '6213', name: '聯茂', role: '高頻高速 CCL' },
            { code: '3017', name: '奇鋐', role: '水冷散熱散熱模組' },
            { code: '3324', name: '雙鴻', role: '水冷板/液冷散熱' },
            { code: '2059', name: '川湖', role: '伺服器伺服滑軌' }
          ]
        },
        midstream: {
          tier: '中游 (Midstream)',
          description: '伺服器主板 (Motherboard) 與電源供應系統',
          companies: [
            { code: '2308', name: '台達電', role: 'AI 伺服器高功率電源' },
            { code: '2382', name: '廣達', role: 'AI 伺服器主板/機櫃' },
            { code: '6669', name: '緯穎', role: '雲端與 AI 伺服器整機' }
          ]
        },
        downstream: {
          tier: '下游 (Downstream)',
          description: '系統整機組裝 (System Assembly) 與資料中心品牌商',
          companies: [
            { code: '2317', name: '鴻海', role: 'NVLink/GB200 伺服器組裝' },
            { code: '3231', name: '緯創', role: 'AI 伺服器 GPU 運算板' },
            { code: '2356', name: '英業達', role: '伺服器組裝' }
          ]
        }
      }
    };

    // Determine position for current stock
    let matchedChain = supplyChainDatabase['半導體'];
    let myTier = '中游 (Midstream)';

    const sectorOrThemes = (currentStock.sector || '') + (currentStock.themes || []).join(' ');

    if (sectorOrThemes.includes('伺服器') || sectorOrThemes.includes('散熱') || sectorOrThemes.includes('代工')) {
      matchedChain = supplyChainDatabase['伺服器'];
    }

    if (['3035', '3443', '3661', '3532', '6488', '3131', '3583', '2383', '3017', '2059'].includes(cleanSymbol)) {
      myTier = '上游 (Upstream)';
    } else if (['2330', '2303', '5347', '2308', '2382', '6669'].includes(cleanSymbol)) {
      myTier = '中游 (Midstream)';
    } else if (['3711', '2449', '6239', '2317', '3231', '2356'].includes(cleanSymbol)) {
      myTier = '下游 (Downstream)';
    }

    // Find group members
    const groupName = currentStock.group || '獨立/同類集團';
    const groupDetails = groupData[groupName] || {
      group: groupName,
      stocks: stocksData.filter(s => s.group === groupName).map(s => ({ code: s.code, name: s.name, sector: s.sector }))
    };

    res.status(200).json({
      success: true,
      symbol: cleanSymbol,
      stockInfo: {
        code: currentStock.code,
        name: currentStock.name,
        sector: currentStock.sector,
        group: groupName,
        themes: currentStock.themes || []
      },
      supplyChain: {
        chainName: matchedChain.chainName,
        myTierLocation: myTier,
        upstream: matchedChain.upstream,
        midstream: matchedChain.midstream,
        downstream: matchedChain.downstream
      },
      conglomerateGroup: {
        groupName: groupDetails.group || groupName,
        description: groupDetails.description || '台股同集團/生態系企業聚落',
        leader: groupDetails.leader || cleanSymbol,
        relatedStocks: groupDetails.stocks || []
      }
    });

  } catch (error) {
    console.error('Supply Chain API Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supply chain relationship data',
      details: error.message
    });
  }
}
