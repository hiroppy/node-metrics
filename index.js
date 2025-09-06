import { readFile, writeFile } from 'fs/promises';

// Constants
const API_BASE_URL = 'https://nodejs.org/metrics/summaries';
const CHART_COLORS = [
  'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)',
  'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)',
  'rgb(199, 199, 199)', 'rgb(83, 102, 147)'
];
const VERSION_RANGE = { min: 4, max: 24 };

// Global state
const table = [];

/**
 * Splits a date string into year, month, and day components
 * @param {string} str - Date string in format 'YYYY-MM-DD'
 * @returns {string[]} Array of [year, month, day]
 */
function splitDate(str) {
  return str.split('-');
}

/**
 * Parses CSV content into a 2D array
 * @param {string} str - CSV content as string
 * @returns {string[][]} 2D array of CSV data
 */
function parseCSV(str) {
  return str.split('\n').map((line) => line.split(','));
}

/**
 * Aggregates download data for a specific month
 * @param {Object} monthData - Month data object containing daily statistics
 * @returns {Object} Aggregated statistics for the month
 */
function calcMonth(monthData) {
  const total = {
    downloads: 0,
    version: {},
    os: {},
    country: {}
  };

  Object.entries(monthData).forEach(([day, dayData]) => {
    total.downloads += Number(dayData.downloads) || 0;

    // Aggregate version data
    if (dayData.version) {
      Object.entries(dayData.version).forEach(([version, count]) => {
        total.version[version] = (total.version[version] || 0) + (Number(count) || 0);
      });
    }

    // Aggregate OS data
    if (dayData.os) {
      Object.entries(dayData.os).forEach(([os, count]) => {
        total.os[os] = (total.os[os] || 0) + (Number(count) || 0);
      });
    }

    // Aggregate country data
    if (dayData.country && Array.isArray(dayData.country)) {
      dayData.country.forEach((countryData) => {
        if (countryData.country && countryData.downloads) {
          total.country[countryData.country] = (total.country[countryData.country] || 0) + Number(countryData.downloads);
        }
      });
    }
  });

  // Convert country data to sorted array
  total.country = Object.entries(total.country)
    .map(([country, downloads]) => ({ country, downloads }))
    .sort((a, b) => b.downloads - a.downloads);

  return total;
}

/**
 * Aggregates download data for a specific year
 * @param {Object} yearData - Year data object containing monthly statistics
 * @returns {Object} Aggregated statistics for the year
 */
function calcYear(yearData) {
  const total = {
    downloads: 0,
    version: {},
    os: {},
    country: {}
  };

  Object.entries(yearData).forEach(([month, monthData]) => {
    const monthTotal = calcMonth(monthData);
    
    total.downloads += monthTotal.downloads;

    // Aggregate version data
    Object.entries(monthTotal.version).forEach(([version, count]) => {
      total.version[version] = (total.version[version] || 0) + Number(count);
    });

    // Aggregate OS data  
    Object.entries(monthTotal.os).forEach(([os, count]) => {
      total.os[os] = (total.os[os] || 0) + Number(count);
    });

    // Aggregate country data
    monthTotal.country.forEach((countryData) => {
      total.country[countryData.country] = (total.country[countryData.country] || 0) + countryData.downloads;
    });
  });

  // Convert country data to sorted array
  total.country = Object.entries(total.country)
    .map(([country, downloads]) => ({ country, downloads }))
    .sort((a, b) => b.downloads - a.downloads);

  return total;
}

/**
 * Reads and parses local CSV file
 * @returns {Promise<string[][]>} Parsed CSV data or empty array if file not found
 */
async function readLocalCSV() {
  try {
    const csvContent = await readFile('./nodejs-downloads.csv', 'utf-8');
    return parseCSV(csvContent);
  } catch (error) {
    console.warn('Local CSV file not found, using only API data:', error.message);
    return [];
  }
}

function processLocalData(csvData) {
  const localTable = {};
  
  // Skip header row
  csvData.slice(1).forEach(row => {
    if (row.length < 4) return;
    
    const [month, version, os, downloads] = row;
    if (!month || !downloads) return;
    
    const [year, monthNum] = month.split('-');
    
    if (!localTable[year]) {
      localTable[year] = {};
    }
    
    if (!localTable[year][monthNum]) {
      localTable[year][monthNum] = {};
    }
    
    // Create a synthetic day (01) for monthly data
    const day = '01';
    if (!localTable[year][monthNum][day]) {
      localTable[year][monthNum][day] = {
        downloads: 0,
        version: {},
        os: {},
        country: []
      };
    }
    
    // Aggregate downloads
    localTable[year][monthNum][day].downloads += parseInt(downloads) || 0;
    
    // Add version data
    if (version) {
      if (!localTable[year][monthNum][day].version[version]) {
        localTable[year][monthNum][day].version[version] = 0;
      }
      localTable[year][monthNum][day].version[version] += parseInt(downloads) || 0;
      
    }
    
    // Add OS data
    if (os && os !== 'unknown') {
      if (!localTable[year][monthNum][day].os[os]) {
        localTable[year][monthNum][day].os[os] = 0;
      }
      localTable[year][monthNum][day].os[os] += parseInt(downloads) || 0;
    }
  });
  
  return localTable;
}

async function generateHTMLFromTemplate(chartsData) {
  try {
    const templateContent = await readFile('./template.html', 'utf-8');
    return templateContent.replace('{{CHARTS_DATA}}', JSON.stringify(chartsData, null, 2));
  } catch (error) {
    console.error('Error reading template file:', error);
    throw error;
  }
}

function prepareChartsData(allYearStats) {
  const chartsData = {
    yearly: {
      labels: [],
      data: []
    },
    os: {
      labels: [],
      data: [],
      total: 0
    },
    versions: {
      labels: [],
      data: []
    },
    versionTrends: {
      labels: [],
      datasets: []
    },
    osTrends: {
      labels: [],
      datasets: []
    }
  };

  const years = Object.keys(allYearStats).sort();
  
  // 年別データ準備
  years.forEach(year => {
    chartsData.yearly.labels.push(year);
    chartsData.yearly.data.push(allYearStats[year].downloads);
  });

  // Prepare version trends data
  const allVersions = new Set();
  years.forEach(year => {
    Object.keys(allYearStats[year].version).forEach(version => {
      // Include only major versions within supported range
      if (!version.includes('.') && 
          parseInt(version) >= VERSION_RANGE.min && 
          parseInt(version) <= VERSION_RANGE.max) {
        allVersions.add(version);
      }
    });
  });

  const majorVersions = Array.from(allVersions)
    .sort((a, b) => parseInt(b) - parseInt(a))
    .slice(0, 8); // Top 8 versions

  chartsData.versionTrends.labels = years;
  chartsData.versionTrends.datasets = majorVersions.map((version, index) => ({
    label: `v${version}`,
    data: years.map(year => {
      const yearStats = allYearStats[year];
      const versionCount = yearStats.version[version] || 0;
      return ((versionCount / yearStats.downloads) * 100); // Percentage
    }),
    borderColor: CHART_COLORS[index % CHART_COLORS.length],
    backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '20',
    tension: 0.1
  }));

  // Prepare OS trends data
  const allOS = new Set();
  years.forEach(year => {
    Object.keys(allYearStats[year].os).forEach(os => {
      allOS.add(os);
    });
  });

  const majorOS = Array.from(allOS).slice(0, 5); // Top 5 OS

  chartsData.osTrends.labels = years;
  chartsData.osTrends.datasets = majorOS.map((os, index) => ({
    label: os,
    data: years.map(year => {
      const yearStats = allYearStats[year];
      const osCount = yearStats.os[os] || 0;
      return ((osCount / yearStats.downloads) * 100); // Percentage
    }),
    borderColor: CHART_COLORS[index % CHART_COLORS.length],
    backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '20',
    tension: 0.1
  }));

  // 2025年のデータ使用（最新年）
  const latestYear = '2025';
  if (allYearStats[latestYear]) {
    const latestStats = allYearStats[latestYear];

    // OS別データ
    const osEntries = Object.entries(latestStats.os)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6); // 上位6つ
    
    chartsData.os.labels = osEntries.map(([os]) => os);
    chartsData.os.data = osEntries.map(([,count]) => count);
    chartsData.os.total = latestStats.downloads;

    // バージョン別データ（上位10個）
    const versionEntries = Object.entries(latestStats.version)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    chartsData.versions.labels = versionEntries.map(([version]) => version);
    chartsData.versions.data = versionEntries.map(([,count]) => count);

  }

  return chartsData;
}

(async () => {
  const total = await fetch(`${API_BASE_URL}/total.csv`).then((res) => res.text());

  // [ 'day', 'downloads', 'TiB' ]
  parseCSV(total).slice(1, -1).forEach((item) => {
    const [y, m, d] = splitDate(item[0]);

    if (!table[y]) {
      table[y] = {};
    }

    if (!table[y][m]) {
      table[y][m] = {};
    }

    table[y][m][d] = {
      downloads: item[1]
    };
  });

  const version = await fetch(`${API_BASE_URL}/version.csv`).then(res => res.text());

  // [ 'day', '6', '4', '0.10', '8', '0.12', '7', '5', 'unknown', '9', ...]
  parseCSV(version).slice(1, -1).forEach((item) => {
    const [y, m, d] = splitDate(item[0]);

    table[y][m][d] = {
      ...table[y][m][d],
      version: {
        '0.10': item[5] || '0',
        '0.12': item[7] || '0',
        '4': item[4] || '0',
        '5': item[8] || '0',
        '6': item[2] || '0',
        '7': item[6] || '0',
        '8': item[1] || '0',
        '9': item[9] || '0',
        '10': item[3] || '0',
        '11': item[11] || '0',
        '12': item[10] || '0',
        '13': item[15] || '0',
        '14': item[14] || '0',
        '15': item[20] || '0',
        '16': item[16] || '0',
        '17': item[22] || '0',
        '18': item[19] || '0',
        '19': item[23] || '0',
        '20': item[27] || '0',
        '21': item[28] || '0',
        '22': item[29] || '0',
        '23': item[30] || '0',
        '24': item[31] || '0'
      }
    }
  });

  const os = await fetch(`${API_BASE_URL}/os.csv`).then(res => res.text());

  // [ 'day', 'linux', 'headers', 'win', 'src', 'osx', 'sunos', 'aix', 'unknown' ]
  parseCSV(os).slice(1, -1).forEach((item) => {
    const [y, m, d] = splitDate(item[0]);

    table[y][m][d] = {
      ...table[y][m][d],
      os: {
        linux: item[1],
        win: item[3],
        osx: item[5],
        sunos: item[6],
        aix: item[7]
      }
    }
  });

  const country = await fetch(`${API_BASE_URL}/country.csv`).then(res => res.text());

  const countryHeaders = parseCSV(country).slice(0, 1)[0];

  parseCSV(country).slice(1, -1).forEach((item) => {
    const arr = item.slice(1, -1).map((e, i) => {
      return {
        index: i + 1,
        num: ~~e
      };
    });

    const country = arr
      .sort((a, b) => {
        if (a.num < b.num) return 1;
        if (a.num > b.num) return -1;
        return 0;
      })
      .map((e) => {
        return {
          country: countryHeaders[e.index],
          downloads: e.num
        };
      });

    const [y, m, d] = splitDate(item[0]);

    table[y][m][d] = {
      ...table[y][m][d],
      country
    };
  });

  // Read and merge local CSV data
  const localCsvData = await readLocalCSV();
  if (localCsvData.length > 0) {
    const localTable = processLocalData(localCsvData);
    
    // Merge local data with existing table (local data takes priority for overlapping years)
    Object.keys(localTable).forEach(year => {
      if (!table[year]) {
        table[year] = {};
      }
      
      Object.keys(localTable[year]).forEach(month => {
        if (!table[year][month]) {
          table[year][month] = {};
        }
        
        Object.keys(localTable[year][month]).forEach(day => {
          // Merge or replace data
          table[year][month][day] = {
            ...table[year][month][day],
            ...localTable[year][month][day]
          };
        });
      });
    });
  }

  // 2009-2025年の年別統計
  console.log('=== Node.js Download Statistics by Year ===\n');
  
  const allYearStats = {};
  
  for (let year = 2009; year <= 2025; year++) {
    const yearStr = year.toString();
    
    if (table[yearStr] && Object.keys(table[yearStr]).length > 0) {
      const yearStats = calcYear(table[yearStr]);
      allYearStats[yearStr] = yearStats;
      
      console.log(`📅 ${year}年`);
      console.log(`📦 Total Downloads: ${yearStats.downloads.toLocaleString()}`);
      
      // OS別統計
      console.log('💻 OS Distribution:');
      Object.entries(yearStats.os)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([os, count]) => {
          const percentage = ((count / yearStats.downloads) * 100).toFixed(1);
          console.log(`  ${os}: ${count.toLocaleString()} (${percentage}%)`);
        });
      
      // 国別統計 (トップ10)
      console.log('🌍 Top 10 Countries:');
      yearStats.country.slice(0, 10).forEach((countryData, index) => {
        const percentage = ((countryData.downloads / yearStats.downloads) * 100).toFixed(1);
        console.log(`  ${index + 1}. ${countryData.country}: ${countryData.downloads.toLocaleString()} (${percentage}%)`);
      });
      
      // バージョン別統計 (上位10つ)
      console.log('🔢 Top 10 Node.js Versions:');
      Object.entries(yearStats.version)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([version, count]) => {
          const percentage = ((count / yearStats.downloads) * 100).toFixed(1);
          console.log(`  v${version}: ${count.toLocaleString()} (${percentage}%)`);
        });
      
      console.log('─'.repeat(50) + '\n');
    }
  }

  // グラフ用データの準備とHTMLファイル生成
  const chartsData = prepareChartsData(allYearStats);
  const htmlContent = await generateHTMLFromTemplate(chartsData);
  
  try {
    await writeFile('charts.html', htmlContent, 'utf-8');
    console.log('📊 Charts have been generated successfully!');
    console.log('🔗 Open charts.html in your browser to view the visualizations.');
  } catch (error) {
    console.error('Error generating charts:', error);
  }

  // console.dir(table, { depth: 5 });
})();
