// ============================================================
// STATE — Single source of truth for all mutable app state
// ============================================================
export const state = {
  // Data
  allStocks:            [],
  allMarketData:        [],
  sectorRankingData:    [],
  themeRankingData:     [],
  groupRankingData:     [],
  historicalRanking:    null,
  liveSnapshotCache:    {},
  globalSectorDataForTable: [],
  currentRadarData:     [],
  bubbleScaleRatio:     1.0, // Scale ratio for bubble size

  // Chart
  chartInstance:        null,
  activeTvWidget:       null,
  currentFetchId:       0,
  _canvasResizeObserver: null,

  // Navigation & UI
  currentSector:        null,
  currentChartMode:     'sector',
  isMacroView:          true,      // 新增：是否在宏觀模式
  currentMacroMode:     'sector',  // 新增：宏觀模式的分類 (sector, theme, group)
  currentPeriodDays:    1,
  currentSizeMode:      'amount_diff', // 'amount_diff' (資金變化) | 'amount' | 'volume' | 'return'
  currentXAxisMode:     'amount_diff', // 'amount_diff' (資金變化) | 'amount' (成交金額) | 'volume' (成交總量)
  currentDetailSort:    { column: 'amount', order: 'desc' },
  hideSingleStockThemes: true,  // 預設隱藏單兵題材 (家數 < 2)
  extremesThreshold:    100,    // 100 表示全顯示，5~50 表示保留前後極端值 %
  isMarketOpenNow:      true,
  // Sorting
  sortCol:        'amount',
  sortDesc:       true,
  radarSortCol:   'amount',
  radarSortDesc:  true,
  themeSortCol:   'amount',
  themeSortDesc:  true,
  groupSortCol:   'amount',
  groupSortDesc:  true,
};
window.quantdeskState = state;
