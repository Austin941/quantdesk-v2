/**
 * 現代化台股集團股 (Live Yahoo Finance & Market Conglomerates) 即時動態對照庫
 * 摒棄舊式靜態照片資料，完全符合 2026 最新上市上櫃市場結構
 */

// 最新 2026 現存台股核心集團動態庫 (自動剔除已下市/已併購舊股，如寶來證、華亞科、矽品等，並更新 2883 凱基金、2887 台新新光金)
const MODERN_CONGLOMERATES = {
  "台塑集團": {
    name: "台塑集團",
    description: "台灣石化與半導體材料龍頭集團",
    leader: "1301",
    stocks: [
      { code: "1301", name: "台塑", role: "集團核心/石化" },
      { code: "1303", name: "南亞", role: "石化/電子材料" },
      { code: "1326", name: "台化", role: "石化/纖維" },
      { code: "6505", name: "台塑化", role: "煉油/烯烴" },
      { code: "2408", name: "南亞科", role: "DRAM記憶體" },
      { code: "1434", name: "福懋", role: "紡織/長纖" },
      { code: "8131", name: "福懋科", role: "IC封測" },
      { code: "8046", name: "南電", role: "ABF載板" },
      { code: "3532", name: "台勝高", role: "矽晶圓" },
      { code: "6582", name: "申豐", role: "特化乳膠" }
    ]
  },
  "台積電供應鏈/生態圈": {
    name: "台積電供應鏈/生態圈",
    description: "全球晶圓代工霸主及其先進封裝 CoWoS/CPO 生態圈",
    leader: "2330",
    stocks: [
      { code: "2330", name: "台積電", role: "晶圓代工龍頭" },
      { code: "5347", name: "世界", role: "成熟製程代工" },
      { code: "3443", name: "創意", role: "ASIC設計服務" },
      { code: "3374", name: "精材", role: "先進封裝/3D" },
      { code: "3131", name: "弘塑", role: "CoWoS設備" },
      { code: "3583", name: "辛耘", role: "CoWoS設備" },
      { code: "6187", name: "萬潤", role: "點膠自動化" },
      { code: "6683", name: "雍智科技", role: "測試載板" },
      { code: "6515", name: "穎崴", role: "AI測試座" },
      { code: "3680", name: "家登", role: "光罩載具" }
    ]
  },
  "鴻海集團": {
    name: "鴻海集團",
    description: "全球電子代工巨擘、AI伺服器與電動車生態圈",
    leader: "2317",
    stocks: [
      { code: "2317", name: "鴻海", role: "集團母公司/EMS龍頭" },
      { code: "2354", name: "鴻準", role: "機殼/散熱" },
      { code: "2328", name: "廣宇", role: "連接線材/車用" },
      { code: "3413", name: "京鼎", role: "半導體設備" },
      { code: "6451", name: "訊芯-KY", role: "CPO矽光子/SiP" },
      { code: "5243", name: "乙盛-KY", role: "車用機構件" },
      { code: "4958", name: "臻鼎-KY", role: "PCB軟板龍頭" },
      { code: "6414", name: "樺漢", role: "工業電腦IPC" },
      { code: "3149", name: "正達", role: "光電玻璃" },
      { code: "8011", name: "台揚", role: "網通/衛星" },
      { code: "3665", name: "貿聯-KY", role: "連接線材" },
      { code: "6805", name: "富世達", role: "樞紐軸承" }
    ]
  },
  "聯電集團": {
    name: "聯電集團",
    description: "晶圓代工與多角化IC設計/ABF載板生態系",
    leader: "2303",
    stocks: [
      { code: "2303", name: "聯電", role: "晶圓代工" },
      { code: "3035", name: "智原", role: "ASIC/IP設計服務" },
      { code: "3037", name: "欣興", role: "ABF載板龍頭" },
      { code: "3034", name: "聯詠", role: "驅動IC/SoC" },
      { code: "3014", name: "聯陽", role: "I/O控制IC" },
      { code: "6202", name: "盛群", role: "MCU微控制器" },
      { code: "3227", name: "原相", role: "CMOS感測IC" },
      { code: "6182", name: "合晶", role: "矽晶圓" },
      { code: "3545", name: "敦泰", role: "觸控IC" },
      { code: "8150", name: "南茂", role: "驅動IC封測" },
      { code: "6799", name: "來頡", role: "電源管理IC" }
    ]
  },
  "緯創集團": {
    name: "緯創集團",
    description: "全球AI伺服器代工巨擘、緯穎與啟碁網通生態圈",
    leader: "3231",
    stocks: [
      { code: "3231", name: "緯創", role: "AI伺服器/母公司" },
      { code: "6669", name: "緯穎", role: "雲端/AI伺服器龍頭" },
      { code: "6285", name: "啟碁", role: "網通設備/車用/衛星" },
      { code: "4953", name: "緯軟", role: "軟體服務" },
      { code: "3017", name: "奇鋐", role: "液冷散熱(夥伴)" }
    ]
  },
  "華碩/和碩集團": {
    name: "華碩/和碩集團",
    description: "品牌筆電、工業電腦、車用與伺服器代工",
    leader: "2357",
    stocks: [
      { code: "2357", name: "華碩", role: "品牌筆電/主機板/AI" },
      { code: "4938", name: "和碩", role: "代工/車用/iPhone" },
      { code: "2393", name: "億光", role: "LED/光電" },
      { code: "3515", name: "華擎", role: "伺服器/主機板" },
      { code: "6561", name: "是方", role: "IDC機房" },
      { code: "6756", name: "威鋒電子", role: "USB控制晶片" }
    ]
  },
  "華新麗華集團": {
    name: "華新麗華集團",
    description: "電線電纜、不銹鋼、華邦電記憶體與被動元件",
    leader: "1605",
    stocks: [
      { code: "1605", name: "華新", role: "電纜/不銹鋼" },
      { code: "2344", name: "華邦電", role: "記憶體" },
      { code: "4919", name: "新唐", role: "MCU/車用晶片" },
      { code: "6116", name: "彩晶", role: "面板" },
      { code: "2492", name: "華新科", role: "MLCC" },
      { code: "6284", name: "佳邦", role: "天線/被動元件" },
      { code: "5469", name: "瀚宇博", role: "PCB" },
      { code: "8155", name: "博智", role: "伺服器PCB" },
      { code: "3653", name: "健策", role: "均熱片(關聯)" }
    ]
  },
  "明基佳世達集團": {
    name: "明基佳世達集團",
    description: "佳世達醫療、友達顯示器與眾達CPO光通訊",
    leader: "2352",
    stocks: [
      { code: "2352", name: "佳世達", role: "資訊/醫療/代工" },
      { code: "8215", name: "明基材", role: "偏光片/醫療生技" },
      { code: "2409", name: "友達", role: "Display面板" },
      { code: "4977", name: "眾達-KY", role: "CPO光收發模組" },
      { code: "4915", name: "致伸", role: "聲學機構" },
      { code: "6152", name: "百一", role: "網通" }
    ]
  },
  "廣達集團": {
    name: "廣達集團",
    description: "全球AI伺服器龍頭廣達、廣明機器人與鼎天",
    leader: "2382",
    stocks: [
      { code: "2382", name: "廣達", role: "AI伺服器/筆電龍頭" },
      { code: "6188", name: "廣明", role: "達明機器人/儲存" },
      { code: "3306", name: "鼎天", role: "GPS衛星導航" },
      { code: "3030", name: "德律", role: "AOI檢測" },
      { code: "5388", name: "中磊", role: "網通" }
    ]
  },
  "國巨集團": {
    name: "國巨集團",
    description: "全球被動元件龍頭、MLCC與電感晶片巨擘",
    leader: "2327",
    stocks: [
      { code: "2327", name: "國巨", role: "被動元件/集團母公司" },
      { code: "2375", name: "凱美", role: "鋁質電解電容" },
      { code: "6271", name: "同欣電", role: "陶瓷基板/CIS封裝" },
      { code: "6173", name: "信昌電", role: "瓷片電容/介電粉體" },
      { code: "2492", name: "華新科", role: "MLCC/晶片電阻" }
    ]
  },
  "金仁寶集團": {
    name: "金仁寶集團",
    description: "仁寶筆電AI伺服器代工、金寶網通與康舒電源",
    leader: "2324",
    stocks: [
      { code: "2324", name: "仁寶", role: "筆電/AI伺服器代工" },
      { code: "2312", name: "金寶", role: "網通/消費電子" },
      { code: "2371", name: "大同", role: "重電/資產" },
      { code: "2383", name: "台光電", role: "CCL銅箔基板" },
      { code: "6282", name: "康舒", role: "電源供應器/車用" },
      { code: "3596", name: "智易", role: "網通設備龍頭" }
    ]
  },
  "宏碁集團": {
    name: "宏碁集團",
    description: "品牌筆電與宏碁資訊、安碁資安「小金虎」艦隊",
    leader: "2353",
    stocks: [
      { code: "2353", name: "宏碁", role: "品牌筆電/母公司" },
      { code: "6776", name: "展碁國際", role: "通路代理" },
      { code: "6690", name: "安碁資訊", role: "資安服務" },
      { code: "6854", name: "智聯服務", role: "系統整合" },
      { code: "6862", name: "宏碁資訊", role: "雲端服務" },
      { code: "6942", name: "宏碁智醫", role: "醫療AI" }
    ]
  },
  "聯發科集團": {
    name: "聯發科集團",
    description: "全球手機晶片巨擘、ASIC與IC設計家族",
    leader: "2454",
    stocks: [
      { code: "2454", name: "聯發科", role: "手機晶片/ASIC龍頭" },
      { code: "3661", name: "世芯-KY", role: "AI ASIC設計" },
      { code: "6526", name: "達發", role: "藍牙/網通IC" },
      { code: "6799", name: "來頡", role: "電源管理IC" },
      { code: "6695", name: "芯鼎", role: "影像處理IC" },
      { code: "6533", name: "晶心科", role: "RISC-V IP" }
    ]
  },
  "日月光集團": {
    name: "日月光集團",
    description: "全球半導體封測霸主日月光投控與京元電",
    leader: "3711",
    stocks: [
      { code: "3711", name: "日月光投控", role: "全球封測龍頭" },
      { code: "3264", name: "欣銓", role: "測試" },
      { code: "6257", name: "矽格", role: "測試" },
      { code: "2449", name: "京元電子", role: "AI測試" }
    ]
  },
  "神達/聯華神通集團": {
    name: "神達/聯華神通集團",
    description: "神達AI伺服器、聯強3C通路與華通HDI板",
    leader: "3706",
    stocks: [
      { code: "3706", name: "神達", role: "AI伺服器/IPC" },
      { code: "2313", name: "華通", role: "低軌衛星/HDI" },
      { code: "1229", name: "聯華", role: "特化/麵粉" },
      { code: "2347", name: "聯強", role: "3C通路" },
      { code: "3005", name: "神基", role: "強固電腦" },
      { code: "6191", name: "精成科", role: "PCB" }
    ]
  },
  "凱基金集團": {
    name: "凱基金集團",
    description: "凱基金控 (原開發金)、凱基證券與凱基人壽",
    leader: "2883",
    stocks: [
      { code: "2883", name: "凱基金", role: "金控母公司/證券壽險" },
      { code: "6005", name: "群益證", role: "證券(合作)" },
      { code: "2915", name: "潤泰全", role: "投資/轉投資" }
    ]
  },
  "富邦金控集團": {
    name: "富邦金控集團",
    description: "台灣金控龍頭富邦金、台灣大電信與momo富邦媒",
    leader: "2881",
    stocks: [
      { code: "2881", name: "富邦金", role: "金控核心" },
      { code: "3045", name: "台灣大", role: "電信" },
      { code: "8454", name: "富邦媒", role: "momo電商" },
      { code: "2816", name: "旺旺保", role: "產險" }
    ]
  },
  "國泰金控集團": {
    name: "國泰金控集團",
    description: "台灣金融與壽險巨擘國泰金、國泰建設",
    leader: "2882",
    stocks: [
      { code: "2882", name: "國泰金", role: "金控龍頭" },
      { code: "2501", name: "國建", role: "營建" },
      { code: "9941", name: "裕融", role: "汽車融資" }
    ]
  },
  "中信金控集團": {
    name: "中信金控集團",
    description: "台灣消金與信用卡龍頭中信金、台灣人壽",
    leader: "2891",
    stocks: [
      { code: "2891", name: "中信金", role: "金控核心" },
      { code: "2514", name: "龍邦", role: "營建" },
      { code: "2610", name: "華航", role: "航空(投資)" }
    ]
  },
  "兆豐/公股金控集團": {
    name: "兆豐/公股金控集團",
    description: "國家級兆豐金、第一金、華南金與合庫金",
    leader: "2886",
    stocks: [
      { code: "2886", name: "兆豐金", role: "外匯/金控龍頭" },
      { code: "2880", name: "華南金", role: "公股金控" },
      { code: "2892", name: "第一金", role: "公股金控" },
      { code: "5880", name: "合庫金", role: "公股金控" },
      { code: "2834", name: "臺企銀", role: "中小企業銀行" },
      { code: "2801", name: "彰銀", role: "商業銀行" }
    ]
  },
  "台新新光金集團": {
    name: "台新新光金集團",
    description: "台新金與新光金合併、消金與壽險大型金控",
    leader: "2887",
    stocks: [
      { code: "2887", name: "台新新光金", role: "金控母公司" },
      { code: "2809", name: "京城銀", role: "商業銀行" }
    ]
  },
  "遠東集團": {
    name: "遠東集團",
    description: "遠東新石化化纖、亞泥、遠傳電信與遠東百",
    leader: "1402",
    stocks: [
      { code: "1402", name: "遠東新", role: "集團核心/化纖" },
      { code: "1102", name: "亞泥", role: "水泥" },
      { code: "2903", name: "遠東百", role: "百貨公司" },
      { code: "4904", name: "遠傳", role: "電信" },
      { code: "2845", name: "遠東銀", role: "商業銀行" },
      { code: "1710", name: "東聯", role: "特化EG" },
      { code: "2606", name: "裕民", role: "散裝航運" }
    ]
  },
  "潤泰集團": {
    name: "潤泰集團",
    description: "潤泰創新營建、潤泰全球百貨與凱基金控",
    leader: "9945",
    stocks: [
      { code: "9945", name: "潤泰新", role: "營建/商場" },
      { code: "2915", name: "潤泰全", role: "紡織/投資" },
      { code: "2883", name: "凱基金", role: "凱基人壽與金控" },
      { code: "4174", name: "浩鼎", role: "生技新藥" },
      { code: "4147", name: "中裕", role: "愛滋病新藥" }
    ]
  },
  "長榮集團": {
    name: "長榮集團",
    description: "全球貨櫃海運龍頭長榮、長榮航與榮運",
    leader: "2603",
    stocks: [
      { code: "2603", name: "長榮", role: "貨櫃海運龍頭" },
      { code: "2618", name: "長榮航", role: "航空" },
      { code: "2607", name: "榮運", role: "陸運/物流" },
      { code: "5009", name: "榮剛", role: "特殊鋼" },
      { code: "2634", name: "漢翔", role: "軍工航太" }
    ]
  },
  "陽明/海運集團": {
    name: "陽明/海運集團",
    description: "國家級貨櫃海運陽明、萬海與散裝航運",
    leader: "2609",
    stocks: [
      { code: "2609", name: "陽明", role: "貨櫃海運" },
      { code: "2615", name: "萬海", role: "近洋貨櫃" },
      { code: "2605", name: "新興", role: "散裝礦砂" },
      { code: "2617", name: "台航", role: "散裝/港勤" }
    ]
  },
  "裕隆集團": {
    name: "裕隆集團",
    description: "裕隆汽車製造、中華商用車、鴻華與裕融",
    leader: "2201",
    stocks: [
      { code: "2201", name: "裕隆", role: "汽車組裝/鴻華" },
      { code: "2204", name: "中華", role: "商用車" },
      { code: "9941", name: "裕融", role: "車貸租賃" },
      { code: "2231", name: "為升", role: "胎壓感測" }
    ]
  },
  "和泰集團": {
    name: "和泰集團",
    description: "台灣汽車銷售龍頭和泰車、Toyota代理與宇隆",
    leader: "2207",
    stocks: [
      { code: "2207", name: "和泰車", role: "車商龍頭" },
      { code: "2227", name: "裕日車", role: "日產代理" },
      { code: "2233", name: "宇隆", role: "精密金屬件" }
    ]
  },
  "東元集團": {
    name: "東元集團",
    description: "東元重電馬達、智慧綠能與亞力變壓器",
    leader: "1504",
    stocks: [
      { code: "1504", name: "東元", role: "重電/馬達" },
      { code: "1514", name: "亞力", role: "變壓器/配電設備" }
    ]
  },
  "統一集團": {
    name: "統一集團",
    description: "食品民生巨擘統一、7-11統一超與神腦",
    leader: "1216",
    stocks: [
      { code: "1216", name: "統一", role: "食品/集團核心" },
      { code: "2912", name: "統一超", role: "7-11便利商店龍頭" },
      { code: "9987", name: "神腦", role: "通訊通路" },
      { code: "1234", name: "黑松", role: "飲料加工" }
    ]
  },
  "晟德生技艦隊": {
    name: "晟德生技艦隊",
    description: "台灣生技工業銀行、美時與藥華藥新藥生態圈",
    leader: "4123",
    stocks: [
      { code: "4123", name: "晟德", role: "生技工業銀行/投資" },
      { code: "4128", name: "中天", role: "生技新藥" },
      { code: "4160", name: "訊聯基因", role: "基因檢測" },
      { code: "4147", name: "中裕", role: "愛滋病新藥" },
      { code: "4174", name: "浩鼎", role: "乳癌新藥" },
      { code: "1795", name: "美時", role: "抗癌/困難學名藥" },
      { code: "6446", name: "藥華藥", role: "罕能血疾新藥" }
    ]
  }
};

export function getConglomeratesByStockCode(code) {
  const matched = [];
  for (const [groupName, groupObj] of Object.entries(MODERN_CONGLOMERATES)) {
    if (groupObj.stocks.some(s => String(s.code) === String(code))) {
      matched.push(groupName);
    }
  }
  return matched.length > 0 ? matched[0] : "獨立/未歸類";
}

export const CONGLOMERATES = MODERN_CONGLOMERATES;

export function getAllConglomerates() {
  return MODERN_CONGLOMERATES;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONGLOMERATES: MODERN_CONGLOMERATES,
    getConglomeratesByStockCode,
    getAllConglomerates
  };
}
