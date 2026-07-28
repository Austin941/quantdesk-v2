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

  // Chart
  chartInstance:        null,
  activeTvWidget:       null,
  currentFetchId:       0,

  // Navigation & UI
  currentSector:        null,
  currentChartMode:     'sector',
  currentPeriodDays:    1,
  currentSizeMode:      'amount_diff', // 'amount_diff' (資金變化) | 'amount' | 'volume' | 'return'
  currentXAxisMode:     'amount_diff', // 'amount_diff' (資金變化) | 'amount' (成交金額) | 'volume' (成交總量)
  currentDetailSort:    { column: 'amount', order: 'desc' },
  hideSingleStockThemes: true,  // 預設隱藏單兵題材 (家數 < 2)
  isMarketOpenNow:      false,

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
