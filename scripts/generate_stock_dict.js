const fs = require('fs');
const path = require('path');
const { CONGLOMERATES, getConglomeratesByStockCode } = require('./conglomerates_database.js');

const baseDir = path.join(process.cwd(), 'stock_dictionary');
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
}

// 相似與同義題材標籤整合歸一對照表
const THEME_CONSOLIDATION_MAP = {
  // CPO & 矽光子 & 光通訊
  'CPO': 'CPO/矽光子光通訊',
  '矽光子': 'CPO/矽光子光通訊',
  '光收發模組': 'CPO/矽光子光通訊',
  '光通訊': 'CPO/矽光子光通訊',
  '光纖設備': 'CPO/矽光子光通訊',
  
  // 先進封裝 CoWoS
  'CoWoS': 'CoWoS/先進封裝',
  '先進封裝': 'CoWoS/先進封裝',
  '面板級封裝': 'CoWoS/先進封裝',
  '玻璃基板': 'CoWoS/先進封裝',
  'FPO': 'CoWoS/先進封裝',

  // AI 伺服器
  'AI伺服器': 'AI伺服器供應鏈',
  '伺服器': 'AI伺服器供應鏈',
  '伺服器機殼': 'AI伺服器供應鏈',
  '伺服器代工': 'AI伺服器供應鏈',
  'AI伺服器代工': 'AI伺服器供應鏈',

  // 機器人 / 自動化
  '人形機器人': '機器人與工業自動化',
  '機器人': '機器人與工業自動化',
  '工業機器人': '機器人與工業自動化',
  '工業自動化': '機器人與工業自動化',

  // 散熱與液冷
  '散熱': '散熱與液冷系統',
  '液冷散熱': '散熱與液冷系統',
  '水冷散熱': '散熱與液冷系統',
  '散熱模組': '散熱與液冷系統',
  '均熱片': '散熱與液冷系統',

  // 重電與綠能電力
  '重電': '重電與綠能電力',
  '電力設備': '重電與綠能電力',
  '變壓器': '重電與綠能電力',
  '配電工程': '重電與綠能電力',
  '綠能': '重電與綠能電力',
  '太陽能': '重電與綠能電力',

  // 載板與被動元件
  'ABF': 'ABF/BT載板與PCB',
  'ABF載板': 'ABF/BT載板與PCB',
  '被動元件': '被動元件與MLCC',
  'MLCC': '被動元件與MLCC',
  '晶片電阻': '被動元件與MLCC',
  '電阻': '被動元件與MLCC',

  // 低軌衛星
  '低軌衛星': '低軌衛星與航太',
  '衛星通訊': '低軌衛星與航太'
};

// 1. Copy CSV
const csvSrc = path.join(process.cwd(), 'public', 'stocks.csv');
const csvDst = path.join(baseDir, 'taiwan_stocks.csv');
fs.copyFileSync(csvSrc, csvDst);

// 2. Parse CSV
const csvData = fs.readFileSync(csvSrc, 'utf-8');
const lines = csvData.split('\n').filter(l => l.trim().length > 0);

const stockList = [];
const themeMap = {};
const clusterMap = {};
const sectorMap = {};
const groupMap = {};

// Initialize groupMap with known CONGLOMERATES
for (const [gName, gObj] of Object.entries(CONGLOMERATES)) {
  groupMap[gName] = {
    group: gName,
    description: gObj.description,
    leader: gObj.leader,
    count: 0,
    stocks: []
  };
}

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 2) continue;
  const code = cols[0].trim();
  const name = cols[1].trim();
  const sector = cols[2] ? cols[2].trim() : '';
  const market = cols[3] ? cols[3].trim() : '';
  const listedDate = cols[4] ? cols[4].trim() : '';
  const isin = cols[5] ? cols[5].trim() : '';
  const themesStr = cols[6] ? cols[6].trim() : '';
  const rawThemes = themesStr ? themesStr.split('、').map(t => t.trim()).filter(Boolean) : [];
  
  // Normalized / Consolidated themes
  const normalizedThemesSet = new Set(rawThemes);
  for (const t of rawThemes) {
    if (THEME_CONSOLIDATION_MAP[t]) {
      normalizedThemesSet.add(THEME_CONSOLIDATION_MAP[t]);
    }
  }
  const themes = Array.from(normalizedThemesSet);
  const themeCount = themes.length;

  const group = getConglomeratesByStockCode(code);

  const stockObj = {
    code,
    name,
    sector,
    market,
    group,
    listed_date: listedDate,
    isin,
    themes,
    theme_count: themeCount
  };

  stockList.push(stockObj);

  if (sector) {
    if (!sectorMap[sector]) sectorMap[sector] = { sector, count: 0, stocks: [] };
    sectorMap[sector].count++;
    sectorMap[sector].stocks.push({ code, name, market });
  }

  if (group && group !== '獨立/未歸類') {
    if (!groupMap[group]) {
      groupMap[group] = { group, description: '', leader: '', count: 0, stocks: [] };
    }
    groupMap[group].count++;
    groupMap[group].stocks.push({ code, name, sector, market });
  }

  for (const t of themes) {
    if (!themeMap[t]) themeMap[t] = { theme: t, count: 0, stocks: [] };
    themeMap[t].count++;
    themeMap[t].stocks.push({ code, name, sector, market });

    // Cluster map
    const clusterName = THEME_CONSOLIDATION_MAP[t];
    if (clusterName) {
      if (!clusterMap[clusterName]) clusterMap[clusterName] = { cluster: clusterName, count: 0, stocks: new Set() };
      clusterMap[clusterName].stocks.add(code);
      clusterMap[clusterName].count = clusterMap[clusterName].stocks.size;
    }
  }
}

// Convert Set to Array for clusterMap
const finalClusters = {};
for (const [cName, cObj] of Object.entries(clusterMap)) {
  finalClusters[cName] = {
    cluster: cName,
    count: cObj.count,
    stock_codes: Array.from(cObj.stocks)
  };
}

// Also save scripts/generate_stock_dict.js synchronously
fs.copyFileSync(path.join(process.cwd(), 'scripts', 'generate_stock_dict.cjs'), path.join(process.cwd(), 'scripts', 'generate_stock_dict.js'));

// Write taiwan_stocks.json
fs.writeFileSync(path.join(baseDir, 'taiwan_stocks.json'), JSON.stringify(stockList, null, 2), 'utf-8');

// Write group_taxonomy.json
fs.writeFileSync(path.join(baseDir, 'group_taxonomy.json'), JSON.stringify(groupMap, null, 2), 'utf-8');

// Write theme_taxonomy.json (with groups & clusters)
const taxonomy = {
  updated_at: new Date().toISOString(),
  total_stocks: stockList.length,
  total_sectors: Object.keys(sectorMap).length,
  total_themes: Object.keys(themeMap).length,
  total_groups: Object.keys(groupMap).length,
  total_clusters: Object.keys(finalClusters).length,
  groups: groupMap,
  sectors: sectorMap,
  themes: themeMap,
  clusters: finalClusters
};
fs.writeFileSync(path.join(baseDir, 'theme_taxonomy.json'), JSON.stringify(taxonomy, null, 2), 'utf-8');

console.log(`[Success] Generated precise stock_dictionary with ${stockList.length} stocks, ${Object.keys(sectorMap).length} sectors, ${Object.keys(groupMap).length} groups, ${Object.keys(themeMap).length} themes, and ${Object.keys(finalClusters).length} clusters (includes 2883 凱基金)!`);
