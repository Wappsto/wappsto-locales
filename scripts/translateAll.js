/* eslint-disable no-await-in-loop */
const fs = require("fs");

const URL = "https://translate.googleapis.com/translate_a/single";
const LANGS = ["da", "de", "es", "ca", "fr", "pt", "it"];

const CACHE = {
  KEY: {},
  TXT: {},
};

async function translate(lang, txt) {
  const response = await fetch(
    `${URL}?client=gtx&sl=en&tl=${lang}&dt=t&q=${txt}`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,da;q=0.8,nb;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "x-client-data":
          "CJS2yQEIpLbJAQipncoBCKz5ygEIlqHLAQiFoM0BCLrIzQEIucrNAQiJ080BGOaYzQE=",
        Referer: "https://translate.i18next.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: null,
      method: "GET",
    }
  );
  const body = await response.json();

  if (body[0]) {
    return body[0].reduce((curr, arr) => curr + arr[0], "");
  }
  process.stderr.write(`Failed to translate ${txt} to ${lang}`);

  return "";
}

function populateCache(lang, name, index, key, item) {
  if (!item) {
    return;
  }
  if (!CACHE.TXT[item]) {
    CACHE.TXT[item] = {};
    LANGS.forEach((l) => {
      CACHE.TXT[item][l] = "";
    });
  }
  if (!CACHE.KEY[index]) {
    CACHE.KEY[index] = {};
  }
  CACHE.KEY[index][lang] = item;
}

function insertTranslated(lang, name, index, key, item) {
  if (CACHE.KEY[index] && CACHE.KEY[index].en !== undefined) {
    CACHE.KEY[index][lang] = item;
    if (!CACHE.TXT[CACHE.KEY[index].en][lang]) {
      CACHE.TXT[CACHE.KEY[index].en][lang] = item;
    }
  } else {
    process.stdout.write(`Invalid key in ${lang} => ${index}\n`);
  }
}

function loopHandler(handler, lang, name, strKey, obj) {
  Object.keys(obj).forEach((k) => {
    const item = obj[k];
    const key = strKey ? `${strKey}.${k}` : k;
    const index = `${name}:${key}`;
    if (typeof item === "string") {
      handler(lang, name, index, key, item);
    } else {
      loopHandler(handler, lang, name, key, item);
    }
  });
}

function loopAll(lang, handler) {
  const path = `${lang}`;

  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((jsonFile) => {
      const data = fs.readFileSync(`${path}/${jsonFile}`);
      const json = JSON.parse(data);
      loopHandler(handler, lang, `${jsonFile.split(".")[0]}`, "", json);
    });
  }
}

function info(txt) {
  process.stdout.write(`\n   ---===ooo [ ${txt} ] ooo===---\n`);
}

function printHeader() {
  process.stdout.write(
    "*************************\n* TRANSLATE ALL STRINGS *\n*************************\n"
  );
}

function progress(count, total) {
  const percent = Math.round((count / total) * 100);
  process.stdout.write(`\r${percent}% (${count}/${total})`);
}

async function triggerFetchError() {
  const orgF = process.stderr.write;
  process.stderr.write = () => {};
  try {
    await fetch();
  } catch (e) {
    // Ignore
  }
  process.stderr.write = orgF;
}

function findInlineTranslations(txt) {
  const regex = /\$t\([\w:.{}, \\"]+\)|{{[\w.]+}}/gi;
  const matched = [];
  let m = regex.exec(txt);
  while (m !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex += 1;
    }

    // The result can be accessed through the `m`-variable.
    m.forEach((match) => {
      matched.push(match);
    });
    m = regex.exec(txt);
  }
  return matched;
}

(async () => {
  printHeader();
  await triggerFetchError();

  loopAll("en", populateCache);

  info("Invalid keys");
  LANGS.forEach((lang) => {
    loopAll(lang, insertTranslated);
  });

  info("Status");
  const txtCount = Object.keys(CACHE.TXT).length;
  const keyCount = Object.keys(CACHE.KEY).length;
  process.stdout.write(`There are ${txtCount} strings and ${keyCount} keys\n`);

  info("Translating");
  for (let l = 0; l < LANGS.length; l += 1) {
    const lang = LANGS[l];
    let total = 0;
    Object.keys(CACHE.KEY).forEach((key) => {
      const item = CACHE.KEY[key][lang];
      if (!item && key) {
        total += 1;
      }
    });

    let count = 0;
    for (let t = 0; t < Object.keys(CACHE.KEY).length; t += 1) {
      const key = Object.keys(CACHE.KEY)[t];
      let txt = CACHE.KEY[key].en;
      const item = CACHE.KEY[key][lang];
      if (!item && txt) {
        let newTxt = "";
        if (txt !== "") {
          count += 1;
          const matched = findInlineTranslations(txt);
          matched.forEach((str, index) => {
            txt = txt.replace(str, new Array(4).join(index));
          });
          newTxt = await translate(lang, txt);
          matched.forEach((str, index) => {
            newTxt = newTxt.replace(new Array(4).join(index), str);
          });
        }
        CACHE.KEY[key][lang] = newTxt;
        progress(count, total);
      }
    }
    process.stdout.write(
      `\r                                                                     `
    );
    process.stdout.write(`\rTranslated ${count} string to ${lang}\n`);
  }

  info("Writing files");
  LANGS.forEach((lang) => {
    const FILES = {};

    Object.keys(CACHE.KEY).forEach((index) => {
      const file = index.split(":")[0];
      const key = index.split(":")[1];
      const item = CACHE.KEY[index][lang];

      if (!FILES[file]) {
        FILES[file] = {};
      }

      if (!FILES[file][lang]) {
        FILES[file][lang] = {};
      }

      let path = FILES[file][lang];
      const keys = key.split(".");
      for (let k = 0; k < keys.length - 1; k += 1) {
        if (!path[keys[k]]) {
          path[keys[k]] = {};
        }
        path = path[keys[k]];
      }
      path[keys[keys.length - 1]] = item;
    });

    Object.keys(FILES).forEach((file) => {
      let fileName = file.split("/");
      fileName = fileName[fileName.length - 1];
      const dir = `${lang}`;
      const path = `${dir}/${fileName}.json`;
      const data = `${JSON.stringify(FILES[file][lang], undefined, 2)}\n`;

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      fs.writeFileSync(path, data);
    });
  });
})();
