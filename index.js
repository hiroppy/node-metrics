const fetch = require('node-fetch');

const prefix = 'https://nodejs.org/metrics/summaries';

const table = [];

function splitDate(str) {
  return str.split('-');
}

function parse(str) {
  return str.split('\n').map((a) => a.split(','));
}

function calcMonth(obj) {
  const total = {
    downloads: 0,
    version: {},
    os: {},
    country: {}
  };

  Object.entries(obj).forEach((dData) => {
    const d = dData[0];

    total.downloads += Number(dData[1].downloads);

    Object.entries(dData[1].version).forEach((v) => {
      if (!total.version[v[0]]) total.version[v[0]] = 0;

      total.version[v[0]] += Number(v[1]);
    });

    Object.entries(dData[1].os).forEach((v) => {
      if (!total.os[v[0]]) total.os[v[0]] = 0;

      total.os[v[0]] += Number(v[1]);
    });

    dData[1].country.forEach((v) => {
      if (!total.country[v.country]) total.country[v.country] = 0;

      total.country[v.country] += Number(v.downloads);
    });
  });

  const c = [];

  Object.entries(total.country).forEach((d) => {
    c.push({
      country: d[0],
      downloads: d[1]
    });
  });

  total.country = c.sort((a, b) => {
    if (a.downloads < b.downloads) return 1;
    if (a.downloads > b.downloads) return -1;
    return 0;
  });

  return total;
}

function calcYeah() {

}

(async () => {
  const total = await fetch(`${prefix}/total.csv`).then((res) => res.text());

  // [ 'day', 'downloads', 'TiB' ]
  parse(total).slice(1, -1).forEach((item) => {
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

  const version = await fetch(`${prefix}/version.csv`).then(res => res.text());

  // [ 'day', '6', '4', '0.10', '8', '0.12', '7', '5', 'unknown', '9', ...]
  parse(version).slice(1, -1).forEach((item) => {
    const [y, m, d] = splitDate(item[0]);

    table[y][m][d] = {
      ...table[y][m][d],
      version: {
        '0.10': item[3],
        '0.12': item[5],
        '4': item[2],
        '5': item[7],
        '6': item[1],
        '7': item[7],
        '8': item[4],
        '9': item[9]
      }
    }
  });

  const os = await fetch(`${prefix}/os.csv`).then(res => res.text());

  // [ 'day', 'linux', 'headers', 'win', 'src', 'osx', 'sunos', 'aix', 'unknown' ]
  parse(os).slice(1, -1).forEach((item) => {
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

  const country = await fetch(`${prefix}/country.csv`).then(res => res.text());

  const list = parse(country).slice(0, 1)[0];

  parse(country).slice(1, -1).forEach((item) => {
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
          country: list[e.index],
          downloads: e.num
        };
      });

    const [y, m, d] = splitDate(item[0]);

    table[y][m][d] = {
      ...table[y][m][d],
      country
    };
  });


  // 2018年、月平均・合計
  {
    Object.entries(table['2018']).forEach((mData) => {
      const m = mData[0];

      // const d3 = calcMonth(mData[1]);
      //
      // console.log(d3);
    });
  }

  // 年度合計
  {
    let total = 0;
    let month = [];

    ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'].forEach((m, i) => {
      const y = i > 8 ? '2018' : '2017';

      const d = calcMonth(table[y][m]).downloads;

      total += d;

      month.push(d);
    });

    console.log(month)
    // console.log(total.toLocaleString())
  }

  // console.dir(table, { depth: 5 });
})();
